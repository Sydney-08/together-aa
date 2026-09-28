const {onSchedule}=require('firebase-functions/v2/scheduler');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {randomBytes,randomUUID}=require('node:crypto');
initializeApp();

const weekdayMap={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
function localParts(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(part=>[part.type,part.value]));
}
function money(value){return `NT$ ${Math.round(value||0).toLocaleString('zh-TW')}`}
function cleanEmail(value){return String(value||'').trim().toLowerCase()}

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
  const {tripId,name}=request.data||{},email=cleanEmail(request.data?.email);
  if(typeof tripId!=='string'||typeof name!=='string'||name.trim().length<1||name.trim().length>30||!email.includes('@'))throw new HttpsError('invalid-argument','請提供正確的成員名稱與 Email');
  const db=getFirestore(),tripRef=db.collection('trips').doc(tripId),token=randomBytes(24).toString('hex'),memberId=randomUUID(),inviteRef=db.collection('tripInvites').doc(token),expiresAt=new Date(Date.now()+7*24*60*60*1000);
  await db.runTransaction(async transaction=>{const snap=await transaction.get(tripRef);if(!snap.exists)throw new HttpsError('not-found','找不到這個行程');const data=snap.data();if(!data.memberUids?.includes(request.auth.uid))throw new HttpsError('permission-denied','你不是這個行程的成員');if((data.state?.members||[]).length>=50)throw new HttpsError('resource-exhausted','行程成員已達上限');const state=structuredClone(data.state),existing=state.members.find(item=>item.linkedUid===request.auth.uid&&cleanEmail(request.auth.token.email)===email);if(existing)throw new HttpsError('already-exists','這個帳號已經是行程成員');state.members.push({id:memberId,name:name.trim(),status:'pending',linkedUid:null});transaction.update(tripRef,{state,updatedAt:FieldValue.serverTimestamp()});transaction.set(inviteRef,{tripId,memberId,email,status:'pending',invitedBy:request.auth.uid,createdAt:FieldValue.serverTimestamp(),expiresAt})});
  const inviteUrl=`https://sydney-08.github.io/together-aa/?invite=${token}`;
  await db.collection('mail').add({to:[email],message:{subject:'一起 AA｜你收到共同帳本邀請',html:`<h2>${request.auth.token.name||'朋友'} 邀請你一起分帳</h2><p>請使用 <strong>${email}</strong> 的 Google 帳號登入並接受邀請。</p><p><a href="${inviteUrl}">接受行程邀請</a></p><p>此連結 7 天內有效。</p>`}});
  return{inviteUrl,expiresAt:expiresAt.toISOString()};
});

exports.acceptTripInvite=onCall({region:'asia-east1'},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','請先使用 Google 帳號登入');
  if(request.auth.token.email_verified!==true)throw new HttpsError('failed-precondition','Google Email 尚未驗證');
  const token=request.data?.token;if(typeof token!=='string'||token.length!==48)throw new HttpsError('invalid-argument','邀請連結格式不正確');
  const db=getFirestore(),inviteRef=db.collection('tripInvites').doc(token);
  let tripId;
  await db.runTransaction(async transaction=>{const inviteSnap=await transaction.get(inviteRef);if(!inviteSnap.exists)throw new HttpsError('not-found','邀請不存在或已失效');const invite=inviteSnap.data();if(invite.status!=='pending')throw new HttpsError('failed-precondition','邀請已經使用');if(invite.expiresAt.toDate()<new Date())throw new HttpsError('deadline-exceeded','邀請已過期');if(cleanEmail(request.auth.token.email)!==cleanEmail(invite.email))throw new HttpsError('permission-denied','請使用受邀的 Google 帳號登入');const tripRef=db.collection('trips').doc(invite.tripId),tripSnap=await transaction.get(tripRef);if(!tripSnap.exists)throw new HttpsError('not-found','行程已不存在');const data=tripSnap.data(),state=structuredClone(data.state),member=state.members.find(item=>item.id===invite.memberId);if(!member)throw new HttpsError('not-found','找不到受邀成員');member.linkedUid=request.auth.uid;member.status='accepted';transaction.update(tripRef,{state,memberUids:[...new Set([...(data.memberUids||[]),request.auth.uid])],updatedAt:FieldValue.serverTimestamp()});transaction.update(inviteRef,{status:'accepted',acceptedUid:request.auth.uid,acceptedAt:FieldValue.serverTimestamp()});tripId=invite.tripId});
  return{tripId};
});

exports.sendWeeklyExpenseReminders=onSchedule({schedule:'0 * * * *',timeZone:'UTC',region:'asia-east1'},async()=>{
  const db=getFirestore(),now=new Date();
  const reminders=await db.collectionGroup('settings').where('enabled','==',true).get();
  for(const reminderDoc of reminders.docs){
    if(reminderDoc.id!=='reminder')continue;
    const reminder=reminderDoc.data(),parts=localParts(now,reminder.timezone||'Asia/Taipei');
    const targetHour=Number((reminder.time||'20:00').split(':')[0]);
    const dateKey=`${parts.year}-${parts.month}-${parts.day}`;
    if(weekdayMap[parts.weekday]!==Number(reminder.weekday)||Number(parts.hour)!==targetHour||reminder.lastSentDate===dateKey)continue;
    const userRef=reminderDoc.ref.parent.parent;
    if(!userRef)continue;
    const current=await userRef.collection('app').doc('current').get();
    const saved=current.data()?.state;
    if(!saved)continue;
    const trips=saved.trips||[saved];
    const allExpenses=trips.flatMap(trip=>(trip.expenses||[]).map(item=>({...item,tripName:trip.tripName})));
    const total=allExpenses.reduce((sum,item)=>sum+Number(item.amount||0),0);
    const rows=allExpenses.slice(-8).reverse().map(item=>`<li>${item.tripName}｜${item.title}：${money(item.amount)}</li>`).join('');
    await db.collection('mail').add({to:[reminder.email],message:{subject:'一起 AA｜每週花費提醒',html:`<h2>你的分帳空間</h2><p>目前共有 ${trips.length} 個帳本、${allExpenses.length} 筆花費，總計 <strong>${money(total)}</strong>。</p><ul>${rows}</ul><p>登入一起 AA 查看完整結算結果。</p>`}});
    await reminderDoc.ref.update({lastSentDate:dateKey,lastSentAt:FieldValue.serverTimestamp()});
  }
});
