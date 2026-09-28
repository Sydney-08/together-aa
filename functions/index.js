const {onSchedule}=require('firebase-functions/v2/scheduler');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {randomBytes,randomUUID}=require('node:crypto');
initializeApp();

const weekdayMap={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
function localParts(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(part=>[part.type,part.value]));
}
function money(value){return `NT$ ${Math.round(value||0).toLocaleString('zh-TW')}`}
function cleanEmail(value){return String(value||'').trim().toLowerCase()}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function tripBalances(state){
  const balance=Object.fromEntries((state.members||[]).map(member=>[member.id,0]));
  for(const expense of state.expenses||[]){
    const amount=Number(expense.amount||0),participants=expense.participantIds||[];
    if(!Object.hasOwn(balance,expense.payerId)||!participants.length||!Number.isFinite(amount))continue;
    balance[expense.payerId]+=amount;
    const share=amount/participants.length;
    for(const id of participants)if(Object.hasOwn(balance,id))balance[id]-=share;
  }
  for(const transfer of state.transfers||[]){
    const amount=Number(transfer.amount||0);
    if(Object.hasOwn(balance,transfer.from)&&Object.hasOwn(balance,transfer.to)&&Number.isFinite(amount)){
      balance[transfer.from]+=amount;balance[transfer.to]-=amount;
    }
  }
  return balance;
}
function settlementPlan(balance){
  const debtors=Object.entries(balance).filter(([,value])=>value<-.01).map(([id,value])=>({id,amount:-value})).sort((a,b)=>b.amount-a.amount);
  const creditors=Object.entries(balance).filter(([,value])=>value>.01).map(([id,value])=>({id,amount:value})).sort((a,b)=>b.amount-a.amount),result=[];
  let debtorIndex=0,creditorIndex=0;
  while(debtorIndex<debtors.length&&creditorIndex<creditors.length){
    const amount=Math.min(debtors[debtorIndex].amount,creditors[creditorIndex].amount);
    result.push({from:debtors[debtorIndex].id,to:creditors[creditorIndex].id,amount});
    debtors[debtorIndex].amount-=amount;creditors[creditorIndex].amount-=amount;
    if(debtors[debtorIndex].amount<.01)debtorIndex++;
    if(creditors[creditorIndex].amount<.01)creditorIndex++;
  }
  return result;
}

exports.listMyTrips=onCall({region:'asia-east1'},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','請先使用 Google 帳號登入');
  const snapshot=await getFirestore().collection('trips').where('memberUids','array-contains',request.auth.uid).get();
  const trips=snapshot.docs.map(item=>{
    const state=structuredClone(item.data().state||{});
    for(const member of state.members||[])delete member.email;
    return state;
  });
  return{trips};
});

exports.inviteTripMember=onCall({region:'asia-east1'},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','請先使用 Google 帳號登入');
  const {tripId,name}=request.data||{},requestedMemberId=request.data?.memberId;
  const email=cleanEmail(request.data?.email);
  if(typeof tripId!=='string'||typeof name!=='string'||name.trim().length<1||name.trim().length>30||!email.includes('@'))throw new HttpsError('invalid-argument','請填寫正確的成員姓名與 Gmail');
  if(requestedMemberId!==undefined&&typeof requestedMemberId!=='string')throw new HttpsError('invalid-argument','成員資料不正確');
  const db=getFirestore(),tripRef=db.collection('trips').doc(tripId),token=randomBytes(24).toString('hex');
  const inviteRef=db.collection('tripInvites').doc(token),expiresAt=new Date(Date.now()+7*24*60*60*1000);
  let memberId;
  await db.runTransaction(async transaction=>{
    const snap=await transaction.get(tripRef);
    if(!snap.exists)throw new HttpsError('not-found','找不到這個帳本');
    const data=snap.data();
    if(!data.memberUids?.includes(request.auth.uid))throw new HttpsError('permission-denied','你不是這個帳本的成員');
    const state=structuredClone(data.state),members=state.members||[];
    if(requestedMemberId){
      const target=members.find(item=>item.id===requestedMemberId);
      if(!target)throw new HttpsError('not-found','找不到指定的成員');
      if(target.linkedUid)throw new HttpsError('already-exists','這位成員已綁定 Google 帳號');
      target.status='pending';memberId=target.id;
    }else{
      if(members.length>=50)throw new HttpsError('resource-exhausted','帳本成員已達上限');
      memberId=randomUUID();members.push({id:memberId,name:name.trim(),status:'pending',linkedUid:null});
    }
    transaction.update(tripRef,{state,updatedAt:FieldValue.serverTimestamp()});
    transaction.set(inviteRef,{tripId,memberId,email,status:'pending',invitedBy:request.auth.uid,createdAt:FieldValue.serverTimestamp(),expiresAt});
  });
  const inviteUrl=`https://sydney-08.github.io/together-aa/?invite=${token}`;
  await db.collection('mail').add({to:[email],message:{subject:'Together AA 行程邀請',html:`<h2>${request.auth.token.name||'你的朋友'} 邀請你加入帳本</h2><p>請使用 <strong>${email}</strong> 的 Google 帳號登入。</p><p><a href="${inviteUrl}">接受帳本邀請</a></p><p>邀請連結將在 7 天後失效。</p>`}});
  return{inviteUrl,expiresAt:expiresAt.toISOString(),memberId};
});

exports.acceptTripInvite=onCall({region:'asia-east1'},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','請先使用 Google 帳號登入');
  if(request.auth.token.email_verified!==true)throw new HttpsError('failed-precondition','Google Email 尚未驗證');
  const token=request.data?.token;
  if(typeof token!=='string'||token.length!==48)throw new HttpsError('invalid-argument','邀請連結格式不正確');
  const db=getFirestore(),inviteRef=db.collection('tripInvites').doc(token);let tripId;
  await db.runTransaction(async transaction=>{
    const inviteSnap=await transaction.get(inviteRef);
    if(!inviteSnap.exists)throw new HttpsError('not-found','邀請不存在或已失效');
    const invite=inviteSnap.data();
    if(invite.status!=='pending')throw new HttpsError('failed-precondition','邀請已經使用過');
    if(invite.expiresAt.toDate()<new Date())throw new HttpsError('deadline-exceeded','邀請已過期');
    if(cleanEmail(request.auth.token.email)!==cleanEmail(invite.email))throw new HttpsError('permission-denied','請使用受邀的 Google 帳號登入');
    const tripRef=db.collection('trips').doc(invite.tripId),tripSnap=await transaction.get(tripRef);
    if(!tripSnap.exists)throw new HttpsError('not-found','帳本不存在');
    const data=tripSnap.data(),state=structuredClone(data.state),member=state.members.find(item=>item.id===invite.memberId);
    if(!member)throw new HttpsError('not-found','找不到受邀成員');
    if(member.linkedUid&&member.linkedUid!==request.auth.uid)throw new HttpsError('already-exists','這位成員已綁定其他帳號');
    member.linkedUid=request.auth.uid;member.status='accepted';
    const memberUids=[...new Set([...(data.memberUids||[]),request.auth.uid])];state.memberUids=memberUids;
    transaction.update(tripRef,{state,memberUids,updatedAt:FieldValue.serverTimestamp()});
    transaction.update(inviteRef,{status:'accepted',acceptedUid:request.auth.uid,acceptedAt:FieldValue.serverTimestamp()});tripId=invite.tripId;
  });
  return{tripId};
});

exports.sendSettlementReminder=onCall({region:'asia-east1'},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','請先使用 Google 帳號登入');
  const {tripId,fromMemberId,toMemberId}=request.data||{};
  if(![tripId,fromMemberId,toMemberId].every(value=>typeof value==='string'&&value.length>0)||fromMemberId===toMemberId)throw new HttpsError('invalid-argument','提醒資料不正確');
  const db=getFirestore(),tripRef=db.collection('trips').doc(tripId),tripSnap=await tripRef.get();
  if(!tripSnap.exists)throw new HttpsError('not-found','找不到這個帳本');
  const tripData=tripSnap.data();
  if(!tripData.memberUids?.includes(request.auth.uid))throw new HttpsError('permission-denied','你不是這個帳本的成員');
  const state=tripData.state||{},debtor=(state.members||[]).find(item=>item.id===fromMemberId),creditor=(state.members||[]).find(item=>item.id===toMemberId);
  if(!debtor||!creditor)throw new HttpsError('not-found','找不到欠款雙方');
  if(!debtor.linkedUid||!creditor.linkedUid)throw new HttpsError('failed-precondition','欠款雙方都需要先綁定 Gmail');
  const settlement=settlementPlan(tripBalances(state)).find(item=>item.from===fromMemberId&&item.to===toMemberId),amount=settlement?.amount||0;
  if(amount<0.01)throw new HttpsError('failed-precondition','這筆款項已經結清或結算資料已更新');
  let users;
  try{users=await Promise.all([getAuth().getUser(debtor.linkedUid),getAuth().getUser(creditor.linkedUid)])}
  catch{throw new HttpsError('failed-precondition','無法取得其中一位成員的 Gmail，請重新綁定帳號')}
  const recipients=[...new Set(users.map(user=>cleanEmail(user.email)).filter(Boolean))];
  if(recipients.length<2)throw new HttpsError('failed-precondition','欠款雙方都需要有效的 Gmail');
  const reminderRef=db.collection('settlementReminders').doc(`${tripId}_${fromMemberId}_${toMemberId}`),now=Date.now();
  await db.runTransaction(async transaction=>{
    const previous=await transaction.get(reminderRef),lastSentAt=previous.data()?.sentAt?.toMillis?.()||0;
    if(now-lastSentAt<60*60*1000)throw new HttpsError('resource-exhausted','一小時內已提醒過，請稍後再試');
    transaction.set(reminderRef,{tripId,fromMemberId,toMemberId,requestedBy:request.auth.uid,amount,sentAt:FieldValue.serverTimestamp()});
  });
  const tripName=escapeHtml(state.tripName||'共同帳本'),debtorName=escapeHtml(debtor.name),creditorName=escapeHtml(creditor.name),amountText=money(amount);
  const subjectTrip=String(state.tripName||'共同帳本').replace(/[\r\n]/g,' ').slice(0,60);
  await db.collection('mail').add({to:recipients,message:{subject:`Together AA 待結清提醒｜${subjectTrip}`,html:`<h2>${tripName} 待結清提醒</h2><p><strong>${debtorName}</strong> 尚需支付 <strong>${amountText}</strong> 給 <strong>${creditorName}</strong>。</p><p>這封信已同時寄給欠款雙方；完成還款後，請回到 Together AA 登記還款或確認結清。</p><p><a href="https://sydney-08.github.io/together-aa/">開啟 Together AA</a></p>`}});
  return{amount,recipientCount:recipients.length};
});

exports.sendWeeklyExpenseReminders=onSchedule({schedule:'0 * * * *',timeZone:'UTC',region:'asia-east1'},async()=>{
  const db=getFirestore(),now=new Date(),reminders=await db.collectionGroup('settings').where('enabled','==',true).get();
  for(const reminderDoc of reminders.docs){
    if(reminderDoc.id!=='reminder')continue;
    const reminder=reminderDoc.data(),parts=localParts(now,reminder.timezone||'Asia/Taipei'),targetHour=Number((reminder.time||'20:00').split(':')[0]),dateKey=`${parts.year}-${parts.month}-${parts.day}`;
    if(weekdayMap[parts.weekday]!==Number(reminder.weekday)||Number(parts.hour)!==targetHour||reminder.lastSentDate===dateKey)continue;
    const tripsSnap=await db.collection('trips').where('memberUids','array-contains',reminder.uid).get(),trips=tripsSnap.docs.map(item=>item.data().state);
    const allExpenses=trips.flatMap(trip=>(trip.expenses||[]).map(item=>({...item,tripName:trip.tripName}))),total=allExpenses.reduce((sum,item)=>sum+Number(item.amount||0),0);
    const rows=allExpenses.slice(-8).reverse().map(item=>`<li>${item.tripName}：${item.title}，${money(item.amount)}</li>`).join('');
    await db.collection('mail').add({to:[reminder.email],message:{subject:'Together AA 每週花費提醒',html:`<h2>你的每週帳本摘要</h2><p>目前共有 ${trips.length} 個帳本、${allExpenses.length} 筆花費，總計 <strong>${money(total)}</strong>。</p><ul>${rows}</ul>`}});
    await reminderDoc.ref.update({lastSentDate:dateKey,lastSentAt:FieldValue.serverTimestamp()});
  }
});
