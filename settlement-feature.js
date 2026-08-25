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

  function expenseDebts(expense){
    const share=expense.amount/expense.participantIds.length;
    return expense.participantIds.filter(id=>id!==expense.payerId).map(id=>{
      const repaid=(state.transfers||[]).filter(item=>item.expenseId===expense.id&&item.from===id&&item.to===expense.payerId).reduce((sum,item)=>sum+Number(item.amount||0),0);
      return{id,share,repaid,outstanding:Math.max(0,share-repaid)};
    });
  }

  renderSettlements=balance=>{
    const list=settlements(balance);
    $('settlementList').innerHTML=list.length?list.map(item=>`<div class="settlement settlement-action"><span>${escapeHtml(member(item.from)?.name||'已離開')}</span><span class="arrow">→</span><span>${escapeHtml(member(item.to)?.name||'已離開')}</span><strong>${money(item.amount)}</strong><button type="button" data-confirm-settlement data-from="${item.from}" data-to="${item.to}" data-amount="${item.amount}">確認結清</button></div>`).join(''):'<div class="all-settled">大家都結清了，漂亮！</div>';
    const confirmed=[...(state.transfers||[])].reverse();
    $('confirmedSettlementList').innerHTML=confirmed.length?`<p class="confirmed-title">已確認還款</p>${confirmed.map(item=>{const expense=state.expenses.find(e=>e.id===item.expenseId);return `<div class="confirmed-item"><span>✓ ${escapeHtml(member(item.from)?.name||item.from)} 已付給 ${escapeHtml(member(item.to)?.name||item.to)}${expense?`<small>${escapeHtml(expense.title)}</small>`:'<small>總帳還款</small>'}</span><strong>${money(item.amount)}</strong><button type="button" data-undo-settlement="${item.id}">撤銷</button></div>`}).join('')}`:'';
    $('copySettlementButton').disabled=!list.length;
  };

  const baseRenderExpenses=renderExpenses;
  renderExpenses=()=>{
    baseRenderExpenses();
    document.querySelectorAll('.expense-item').forEach(item=>{
      const detail=item.querySelector('.expense-info p'),amount=item.querySelector('.expense-amount strong');
      if(detail&&amount){const payer=detail.textContent.split(' 先付')[0];detail.innerHTML=`<b>${escapeHtml(payer)} 付款 ${escapeHtml(amount.textContent)}</b><span>${detail.textContent.includes('·')?' · '+detail.textContent.split('·')[1].trim():''}</span>`}
      const expenseId=item.querySelector('[data-delete-expense]')?.dataset.deleteExpense,expense=state.expenses.find(entry=>entry.id===expenseId);
      if(expense){const debts=expenseDebts(expense),outstanding=debts.reduce((sum,debt)=>sum+debt.outstanding,0),repaid=debts.reduce((sum,debt)=>sum+debt.repaid,0),status=outstanding<.01?'已結清':repaid>0?`部分還款 · 尚欠 ${money(outstanding)}`:`尚欠 ${money(outstanding)}`;item.insertAdjacentHTML('beforeend',`<div class="expense-payment-status ${outstanding<.01?'settled':''}"><span>${outstanding<.01?'✓':'○'} ${status}</span><button type="button" data-open-expense-payment="${expense.id}" ${debts.length?'':'disabled'}>${outstanding<.01?'查看還款':'登記還款'}</button></div>`)}
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
    state.transfers.push({id:crypto.randomUUID(),from:from.id,to:to.id,amount,expenseId:null,confirmedAt:new Date().toISOString()});
    render();showToast('已記錄這筆還款並重新結算');
  };
  $('confirmedSettlementList').onclick=e=>{
    const button=e.target.closest('[data-undo-settlement]');if(!button)return;
    state.transfers=(state.transfers||[]).filter(item=>item.id!==button.dataset.undoSettlement);
    render();showToast('已撤銷結清紀錄');
  };

  function updatePaymentOutstanding(){const expense=state.expenses.find(item=>item.id===$('paymentExpenseId').value),debt=expenseDebts(expense).find(item=>item.id===$('paymentDebtor').value),outstanding=debt?.outstanding||0;$('paymentOutstanding').textContent=money(outstanding);$('paymentAmount').max=String(outstanding);return outstanding}
  $('expenseList').addEventListener('click',e=>{const button=e.target.closest('[data-open-expense-payment]');if(!button)return;const expense=state.expenses.find(item=>item.id===button.dataset.openExpensePayment),debts=expenseDebts(expense),openDebts=debts.filter(item=>item.outstanding>.01);$('paymentExpenseId').value=expense.id;$('expensePaymentTitle').textContent=expense.title;$('paymentDebtor').innerHTML=(openDebts.length?openDebts:debts).map(debt=>`<option value="${debt.id}">${escapeHtml(member(debt.id)?.name||'已離開')}${debt.outstanding<.01?'（已結清）':''}</option>`).join('');$('paymentAmount').value='';updatePaymentOutstanding();$('expensePaymentDialog').showModal()});
  $('paymentDebtor').onchange=()=>{$('paymentAmount').value='';updatePaymentOutstanding()};
  $('fillOutstandingButton').onclick=()=>{$('paymentAmount').value=String(updatePaymentOutstanding())};
  $('expensePaymentForm').onsubmit=e=>{e.preventDefault();const expense=state.expenses.find(item=>item.id===$('paymentExpenseId').value),amount=Number($('paymentAmount').value),outstanding=updatePaymentOutstanding(),from=$('paymentDebtor').value;if(amount<=0||amount>outstanding+.01){showToast(`還款金額需介於 NT$ 1 與 ${money(outstanding)} 之間`);return}state.transfers=state.transfers||[];state.transfers.push({id:crypto.randomUUID(),from,to:expense.payerId,amount,expenseId:expense.id,confirmedAt:new Date().toISOString()});$('expensePaymentDialog').close();render();showToast(Math.abs(amount-outstanding)<.01?'此成員的單筆費用已結清':'部分還款已記錄')};
})();
