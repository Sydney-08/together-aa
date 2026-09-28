(() => {
  function balanceRows(){
    const rows=[];
    for(const trip of workspace.trips||[]){
      const me=trip.currentUserId;
      if(!me)continue;
      const people=Object.fromEntries((trip.members||[]).map(item=>[item.id,item.name]));
      const plan=settlements(calculations(trip).balance);
      for(const item of plan){
        if(item.from===me)rows.push({direction:'owe',name:people[item.to]||'未知成員',amount:item.amount,tripName:trip.tripName});
        if(item.to===me)rows.push({direction:'owed',name:people[item.from]||'未知成員',amount:item.amount,tripName:trip.tripName});
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
    $('homeBalanceNotice').innerHTML=rows.length?rows.sort((a,b)=>b.amount-a.amount).map(item=>`<li class="${item.direction}"><span>${item.direction==='owe'?'我欠':'欠我'} <b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.tripName)}</small></span><strong>${money(item.amount)}</strong></li>`).join(''):'<li class="empty-balance">目前沒有待結清款項</li>';
  }
  const baseRenderDashboard=renderDashboard;
  renderDashboard=()=>{baseRenderDashboard();renderHomeBalances()};
  renderHomeBalances();
})();
