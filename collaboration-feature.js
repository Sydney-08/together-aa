(() => {
  let stopTripListener=null;
  const baseRenderMembers=renderMembers;
  renderMembers=calc=>{
    baseRenderMembers(calc);
    document.querySelectorAll('#memberList .member').forEach((row,index)=>{
      const item=state.members[index];if(!item)return;
      const info=row.querySelector('.member-info'),remove=row.querySelector('[data-delete-member]');
      if(item.linkedUid){
        info?.insertAdjacentHTML('beforeend','<small class="member-link-status">已綁定 Google 帳號</small>');
        if(remove){remove.disabled=true;remove.title='已綁定的共同帳本成員不能直接刪除'}
      }else{
        info?.insertAdjacentHTML('beforeend',`<small class="member-link-status">${item.status==='pending'?'等待接受 Gmail 邀請':'尚未設定 Gmail'}</small>`);
        row.insertAdjacentHTML('beforeend',`<button class="member-gmail-button" type="button" data-member-gmail="${item.id}">${item.status==='pending'?'更新 Gmail':'設定 Gmail'}</button>`);
      }
    });
  };

  async function sendInvite(name,email,memberId=null){
    if(!window.FirebaseService?.currentUser())throw new Error('請先登入 Google 帳號');
    await FirebaseService.syncNow(getWorkspace());
    const result=await FirebaseService.inviteMember(state.id,name,email,memberId);
    const latest=await FirebaseService.loadCurrent();if(latest)applyWorkspace(latest);
    $('inviteResultUrl').value=result.inviteUrl;$('inviteResultDialog').showModal();
  }

  $('memberForm').onsubmit=async e=>{
    e.preventDefault();
    const name=$('memberName').value.trim(),email=$('memberEmail').value.trim().toLowerCase(),user=window.FirebaseService?.currentUser();
    if(!name)return;
    if(user&&email){
      try{await sendInvite(name,email);$('memberDialog').close();showToast(`已邀請 ${name}`)}
      catch(error){showToast(error.message?.replace('FirebaseError: ','')||'邀請建立失敗')}
      return;
    }
    state.members.push({id:crypto.randomUUID(),name,email:'',status:'local'});$('memberDialog').close();render();showToast(`${name} 已加入帳本`);
  };

  $('memberList').addEventListener('click',e=>{
    const button=e.target.closest('[data-member-gmail]');if(!button)return;
    e.stopPropagation();const target=state.members.find(item=>item.id===button.dataset.memberGmail);if(!target)return;
    $('existingMemberId').value=target.id;$('existingMemberName').value=target.name;$('existingMemberLabel').textContent=target.name;$('existingMemberEmail').value='';
    $('memberGmailDialog').showModal();setTimeout(()=>$('existingMemberEmail').focus(),50);
  });
  $('memberGmailForm').onsubmit=async e=>{
    e.preventDefault();const memberId=$('existingMemberId').value,name=$('existingMemberName').value,email=$('existingMemberEmail').value.trim().toLowerCase();
    try{await sendInvite(name,email,memberId);$('memberGmailDialog').close();showToast(`已寄出 ${name} 的 Gmail 邀請`)}
    catch(error){showToast(error.message?.replace('FirebaseError: ','')||'Gmail 邀請建立失敗')}
  };
  $('copyInviteButton').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteResultUrl').value);showToast('邀請連結已複製')}catch{$('inviteResultUrl').select();document.execCommand('copy')}};

  window.addEventListener('aa-auth-change',async event=>{
    stopTripListener?.();if(!event.detail.user)return;
    setTimeout(()=>{stopTripListener=FirebaseService.listenTrips(latest=>{if(latest.trips.some(trip=>trip.id===workspace.activeTripId))latest.activeTripId=workspace.activeTripId;applyWorkspace(latest)},error=>console.error('trip document listener:',error))},1200);
    const token=new URLSearchParams(location.search).get('invite');if(!token)return;
    try{await FirebaseService.acceptInvite(token);const latest=await FirebaseService.loadCurrent();if(latest){applyWorkspace(latest);showDashboard()}history.replaceState({},'',location.pathname);showToast('邀請已接受，現在可以共同記帳')}
    catch(error){showToast(error.message?.replace('FirebaseError: ','')||'無法接受這份邀請')}
  });
  const token=new URLSearchParams(location.search).get('invite');
  if(token&&!FirebaseService.currentUser()){$('loginButton').textContent='登入並接受行程邀請';showToast('請使用受邀的 Google 帳號登入')}
  render();
})();
