import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,deleteDoc,serverTimestamp,query,where,onSnapshot} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';

const configured=window.FIREBASE_CONFIG?.apiKey&&!window.FIREBASE_CONFIG.apiKey.startsWith('REPLACE_');
let auth,db,functions,user=null,saveTimer,knownTripIds=new Set();
if(configured){const app=initializeApp(window.FIREBASE_CONFIG);auth=getAuth(app);db=getFirestore(app);functions=getFunctions(app,'asia-east1');setPersistence(auth,browserLocalPersistence);onAuthStateChanged(auth,next=>{user=next;window.dispatchEvent(new CustomEvent('aa-auth-change',{detail:{user:next,configured:true}}))})}
const requireUser=()=>{if(!user)throw new Error('請先登入 Google 帳號')};
function prepareTrip(input){const trip=structuredClone(input),owner=trip.members.find(item=>item.id===trip.currentUserId)||trip.members[0];trip.ownerUid=trip.ownerUid||user.uid;trip.memberUids=[...new Set([...(trip.memberUids||[]),user.uid])];trip.members.forEach(member=>delete member.email);if(trip.ownerUid===user.uid&&owner){owner.linkedUid=user.uid;owner.status='accepted';owner.name=owner.name==='你'?(user.displayName||'你'):owner.name}return trip}
async function writeWorkspace(workspace){requireUser();const incomingIds=new Set((workspace.trips||[]).map(item=>item.id));for(const input of workspace.trips||[]){const trip=prepareTrip(input),ref=doc(db,'trips',trip.id),payload={ownerUid:trip.ownerUid,memberUids:trip.memberUids,state:trip,updatedAt:serverTimestamp()};if(!knownTripIds.has(trip.id))payload.createdAt=serverTimestamp();await setDoc(ref,payload,{merge:true});knownTripIds.add(trip.id)}for(const id of [...knownTripIds])if(!incomingIds.has(id)){try{await deleteDoc(doc(db,'trips',id));knownTripIds.delete(id)}catch{}}}
window.FirebaseService={
  configured,
  login:()=>{if(!configured)throw new Error('尚未設定 Firebase');return signInWithPopup(auth,new GoogleAuthProvider())},logout:()=>signOut(auth),currentUser:()=>user,
  async loadCurrent(){requireUser();const snap=await getDocs(query(collection(db,'trips'),where('memberUids','array-contains',user.uid)));if(!snap.empty){knownTripIds=new Set(snap.docs.map(item=>item.id));const trips=snap.docs.map(item=>{const trip=item.data().state;const linked=trip.members?.find(member=>member.linkedUid===user.uid);if(linked)trip.currentUserId=linked.id;return trip});return{version:2,activeTripId:trips[0].id,trips}}const legacy=await getDoc(doc(db,'users',user.uid,'app','current'));if(legacy.exists()){const old=legacy.data().state,workspace=old.trips?old:{version:1,activeTripId:old.id,trips:[old]};await writeWorkspace(workspace);return workspace}return null},
  saveCurrent(workspace){if(!user)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>writeWorkspace(workspace).catch(error=>window.dispatchEvent(new CustomEvent('aa-cloud-error',{detail:error}))),600)},
  async syncNow(workspace){requireUser();clearTimeout(saveTimer);await writeWorkspace(workspace)},
  listenTrips(callback){requireUser();return onSnapshot(query(collection(db,'trips'),where('memberUids','array-contains',user.uid)),snap=>{if(snap.empty)return;knownTripIds=new Set(snap.docs.map(item=>item.id));const trips=snap.docs.map(item=>{const trip=item.data().state,linked=trip.members?.find(member=>member.linkedUid===user.uid);if(linked)trip.currentUserId=linked.id;return trip});callback({version:2,activeTripId:trips[0].id,trips})})},
  async deleteTrip(id){requireUser();await deleteDoc(doc(db,'trips',id));knownTripIds.delete(id)},
  async inviteMember(tripId,name,email){requireUser();return(await httpsCallable(functions,'inviteTripMember')({tripId,name,email})).data},
  async acceptInvite(token){requireUser();return(await httpsCallable(functions,'acceptTripInvite')({token})).data},
  async saveReport(report){requireUser();await setDoc(doc(db,'users',user.uid,'reports',report.id),report)},async reports(){requireUser();const snap=await getDocs(collection(db,'users',user.uid,'reports'));return snap.docs.map(x=>x.data()).sort((a,b)=>new Date(b.archivedAt)-new Date(a.archivedAt))},async removeReport(id){requireUser();await deleteDoc(doc(db,'users',user.uid,'reports',id))},
  async getReminder(){requireUser();const snap=await getDoc(doc(db,'users',user.uid,'settings','reminder'));return snap.exists()?snap.data():null},async saveReminder(settings){requireUser();await setDoc(doc(db,'users',user.uid,'settings','reminder'),{...settings,uid:user.uid,displayName:user.displayName||'',updatedAt:serverTimestamp()})}
};
window.dispatchEvent(new CustomEvent('aa-firebase-ready',{detail:{configured}}));
