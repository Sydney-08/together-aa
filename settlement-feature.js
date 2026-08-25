(() => {
  const baseCalculations=calculations;
  calculations=(source=state)=>{
    const result=baseCalculations(source);
    (source.transfers||[]).forEach(transfer=>{
      if(Object.hasOwn(result.balance,transfer.from)&&Object.hasOwn(result.balance,transfer.to)){
        result.balance[transfer.from]+=Number(transfer.amount||0);
        result.balance[transfer.to]-=Number(transfer.amount||0);
      }
    });
    return result;
  };

  renderSettlements=balance=>{
    const list=settlements(balance);
    $('settlementList').innerHTML=list.length?list.map(item=>`<div class="settlement settlement-action"><span>${escapeHtml(member(item.from)?.name||'已離開')}</span><span class="arrow">→</span><span>${escapeHtml(member(item.to)?.name||'已離開')}</span><strong>${money(item.amount)}</strong><button type="button" data-confirm-settlement data-from="${item.from}" data-to="${item.to}" data-amount="${item.amount}">確認結清</button></div>`).join(''):'<div class="all-settled">大家都結清了，漂亮！</div>';
    const confirmed=[...(state.transfers||[])].reverse();
    $('confirmedSettlementList').innerHTML=confirmed.length?`<p class="confirmed-title">已確認還款</p>${confirmed.map(item=>`<div class="confirmed-item"><span>✓ ${escapeHtml(member(item.from)?.name||item.from)} 已付給 ${escapeHtml(member(item.to)?.name||item.to)}</span><strong>${money(item.amount)}</strong><button type="button" data-undo-settlement="${item.id}">撤銷</button></div>`).join('')}`:'';
    $('copySettlementButton').disabled=!list.length;
  };

  const baseRenderExpenses=renderExpenses;
  renderExpenses=()=>{
    baseRenderExpenses();
    document.querySelectorAll('.expense-item').forEach(item=>{
      const detail=item.querySelector('.expense-info p'),amount=item.querySelector('.expense-amount strong');
      if(detail&&amount){const payer=detail.textContent.split(' 先付')[0];detail.innerHTML=`<b>${escapeHtml(payer)} 付款 ${escapeHtml(amount.textContent)}</b><span>${detail.textContent.includes('·')?' · '+detail.textContent.split('·')[1].trim():''}</span>`}
    });
  };

  const baseDeleteMember=deleteMember;
  deleteMember=id=>{baseDeleteMember(id);if(!member(id)){state.transfers=(state.transfers||[]).filter(item=>item.from!==id&&item.to!==id);render()}};

  $('settlementList').onclick=e=>{
    const button=e.target.closest('[data-confirm-settlement]');
    if(!button)return;
    const from=member(button.dataset.from),to=member(button.dataset.to),amount=Number(button.dataset.amount);
    if(!confirm(`確認「${from.name}」已支付 ${money(amount)} 給「${to.name}」嗎？`))return;
    state.transfers=state.transfers||[];
    state.transfers.push({id:crypto.randomUUID(),from:from.id,to:to.id,amount,confirmedAt:new Date().toISOString()});
    render();showToast('已記錄這筆還款並重新結算');
  };
  $('confirmedSettlementList').onclick=e=>{
    const button=e.target.closest('[data-undo-settlement]');if(!button)return;
    state.transfers=(state.transfers||[]).filter(item=>item.id!==button.dataset.undoSettlement);
    render();showToast('已撤銷結清紀錄');
  };
})();
