(() => {
  function balanceRows(){
    const rows=[];
    for(const trip of workspace.trips||[]){
      const me=trip.currentUserId;
      if(!me)continue;
      const people=Object.fromEntries((trip.members||[]).map(item=>[item.id,item.name]));
      const plan=settlements(calculations(trip).balance);
      for(const item of plan){
        if(item.from===me)rows.push({direction:'owe',name:people[item.to]||'未知成員',amount:item.amount,tripName:trip.tripName,tripId:trip.id,from:item.from,to:item.to});
        if(item.to===me)rows.push({direction:'owed',name:people[item.from]||'未知成員',amount:item.amount,tripName:trip.tripName,tripId:trip.id,from:item.from,to:item.to});
      }
    }
    return rows;
  }
  function renderHomeBalances(){
    const root=$('homeBalancePanel');if(!root)return;
    const rows=balanceRows(),owe=rows.filter(x=>x.direction==='owe'),owed=rows.filter(x=>x.direction==='owed');
    const oweTotal=owe.reduce((sum,x)=>sum+x.amount,0),owedTotal=owed.reduce((sum,x)=>sum+x.amount,0),total=oweTotal+owedTotal;
    const oweRatio=total?Math.round(oweTotal/total*100):0,owedRatio=total?100-oweRatio:0;
    $('homeOweAmount').textContent=money(oweTotal);$('homeOwedAmount').textContent=money(owedTotal);
    $('homeOweRatio').textContent=`${oweRatio}%`;$('homeOwedRatio').textContent=`${owedRatio}%`;
    $('homeBalanceBarOwe').style.width=`${oweRatio}%`;$('homeBalanceBarOwed').style.width=`${owedRatio}%`;
    $('homeBalanceNotice').innerHTML=rows.length?rows.sort((a,b)=>b.amount-a.amount).map(item=>`<li class="${item.direction}"><span>${item.direction==='owe'?'我欠':'欠我'} <b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.tripName)}</small></span><strong>${money(item.amount)}</strong><button type="button" class="home-remind-button" data-home-remind data-trip="${escapeHtml(item.tripId)}" data-from="${escapeHtml(item.from)}" data-to="${escapeHtml(item.to)}">提醒還款</button></li>`).join(''):'<li class="empty-balance">目前沒有待結清款項</li>';
  }
  $('homeBalanceNotice')?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-home-remind]');if(!button)return;
    if(!window.FirebaseService?.currentUser()){showToast('請先登入 Google 帳號');return}
    const trip=(workspace.trips||[]).find(item=>item.id===button.dataset.trip),from=trip?.members?.find(item=>item.id===button.dataset.from),to=trip?.members?.find(item=>item.id===button.dataset.to);
    if(!from?.linkedUid||!to?.linkedUid){showToast('欠款雙方都需要先設定並接受 Gmail 邀請');return}
    button.disabled=true;const originalText=button.textContent;button.textContent='寄送中…';
    try{await FirebaseService.syncNow(getWorkspace());await FirebaseService.sendSettlementReminder(trip.id,from.id,to.id);showToast(`已同時提醒 ${from.name} 與 ${to.name}`)}
    catch(error){showToast(error.message?.replace('FirebaseError: ','')||'提醒寄送失敗')}
    finally{button.disabled=false;button.textContent=originalText}
  });
  const baseRenderDashboard=renderDashboard;
  renderDashboard=()=>{baseRenderDashboard();renderHomeBalances()};
  renderHomeBalances();
})();
