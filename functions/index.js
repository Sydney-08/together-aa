const {onSchedule}=require('firebase-functions/v2/scheduler');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
initializeApp();

const weekdayMap={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
function localParts(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(part=>[part.type,part.value]));
}
function money(value){return `NT$ ${Math.round(value||0).toLocaleString('zh-TW')}`}

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
