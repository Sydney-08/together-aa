import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const configured=window.FIREBASE_CONFIG?.apiKey&&!window.FIREBASE_CONFIG.apiKey.startsWith('REPLACE_');
let auth,db,user=null,saveTimer;
if(configured){const app=initializeApp(window.FIREBASE_CONFIG);auth=getAuth(app);db=getFirestore(app);setPersistence(auth,browserLocalPersistence);onAuthStateChanged(auth,next=>{user=next;window.dispatchEvent(new CustomEvent('aa-auth-change',{detail:{user:next,configured:true}}))})}
const requireUser=()=>{if(!user)throw new Error('請先登入 Google 帳號')};
window.FirebaseService={
  configured,
  login:()=>{if(!configured)throw new Error('尚未設定 Firebase');return signInWithPopup(auth,new GoogleAuthProvider())},
  logout:()=>signOut(auth),
  currentUser:()=>user,
  async loadCurrent(){requireUser();const snap=await getDoc(doc(db,'users',user.uid,'app','current'));return snap.exists()?snap.data().state:null},
  saveCurrent(state){if(!user)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>setDoc(doc(db,'users',user.uid,'app','current'),{state,updatedAt:serverTimestamp()},{merge:true}),500)},
  async saveReport(report){requireUser();await setDoc(doc(db,'users',user.uid,'reports',report.id),report)},
  async reports(){requireUser();const snap=await getDocs(collection(db,'users',user.uid,'reports'));return snap.docs.map(x=>x.data()).sort((a,b)=>new Date(b.archivedAt)-new Date(a.archivedAt))},
  async removeReport(id){requireUser();await deleteDoc(doc(db,'users',user.uid,'reports',id))},
  async getReminder(){requireUser();const snap=await getDoc(doc(db,'users',user.uid,'settings','reminder'));return snap.exists()?snap.data():null},
  async saveReminder(settings){requireUser();await setDoc(doc(db,'users',user.uid,'settings','reminder'),{...settings,uid:user.uid,displayName:user.displayName||'',updatedAt:serverTimestamp()})}
};
window.dispatchEvent(new CustomEvent('aa-firebase-ready',{detail:{configured}}));
