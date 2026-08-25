(() => {
  const localStore={save:TripDatabase.save,all:TripDatabase.all,remove:TripDatabase.remove};
  TripDatabase.save=report=>window.FirebaseService?.currentUser()?FirebaseService.saveReport(report):localStore.save(report);
  TripDatabase.all=()=>window.FirebaseService?.currentUser()?FirebaseService.reports():localStore.all();
  TripDatabase.remove=id=>window.FirebaseService?.currentUser()?FirebaseService.removeReport(id):localStore.remove(id);
  const localSave=saveState;
  saveState=()=>{localSave();window.FirebaseService?.saveCurrent(getWorkspace())};

  const loginButton=$('loginButton'),userButton=$('userButton'),reminderButton=$('reminderButton');
  function showSignedOut(configured){loginButton.hidden=false;userButton.hidden=true;reminderButton.hidden=true;loginButton.textContent=configured?'使用 Google 登入':'設定 Firebase 後登入'}
  function showSignedIn(user){loginButton.hidden=true;userButton.hidden=false;reminderButton.hidden=false;$('userPhoto').src=user.photoURL||'';$('userName').textContent=user.displayName||user.email;$('accountPhoto').src=user.photoURL||'';$('accountName').textContent=user.displayName||'Google 使用者';$('accountEmail').textContent=user.email||''}
  loginButton.onclick=async()=>{if(!window.FirebaseService?.configured){showToast('請先填寫 firebase-config.js 的專案設定');return}try{await FirebaseService.login()}catch(error){showToast(error.code==='auth/popup-closed-by-user'?'已取消登入':'Google 登入失敗')}};
  userButton.onclick=()=>$('accountDialog').showModal();
  $('accountDialog').onclick=e=>{if(e.target===$('accountDialog'))$('accountDialog').close()};
  $('logoutButton').onclick=async()=>{await FirebaseService.logout();$('accountDialog').close();showToast('已登出，現在顯示此裝置的本機資料')};
  reminderButton.onclick=async()=>{const user=FirebaseService.currentUser();$('reminderEmail').value=user.email||'';$('reminderTimezone').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone;try{const settings=await FirebaseService.getReminder();if(settings){$('reminderEnabled').checked=!!settings.enabled;$('reminderEmail').value=settings.email||user.email;$('reminderWeekday').value=String(settings.weekday??1);$('reminderTime').value=settings.time||'20:00'}}catch{}$('reminderDialog').showModal()};
  $('reminderForm').onsubmit=async e=>{e.preventDefault();const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;try{await FirebaseService.saveReminder({enabled:$('reminderEnabled').checked,email:$('reminderEmail').value.trim(),weekday:Number($('reminderWeekday').value),time:$('reminderTime').value,timezone,nextSendAt:new Date().toISOString()});$('reminderDialog').close();showToast('Email 提醒設定已儲存')}catch{showToast('提醒設定儲存失敗')}};
  window.addEventListener('aa-firebase-ready',e=>showSignedOut(e.detail.configured));
  window.addEventListener('aa-auth-change',async e=>{const user=e.detail.user;if(!user){showSignedOut(e.detail.configured);return}showSignedIn(user);try{const cloudState=await FirebaseService.loadCurrent();if(cloudState){if(!applyWorkspace(cloudState)){const legacy={...cloudState,id:crypto.randomUUID(),startDate:'',endDate:'',createdAt:new Date().toISOString()};applyWorkspace({version:1,activeTripId:legacy.id,trips:[legacy]})}showDashboard();showToast('已載入你的所有雲端行程')}else{FirebaseService.saveCurrent(getWorkspace());showToast('已登入，這台裝置的所有帳本已同步至雲端')}}catch{showToast('登入成功，但雲端資料暫時無法讀取')}});
  showSignedOut(window.FirebaseService?.configured||false);
})();
