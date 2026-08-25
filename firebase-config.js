// Firebase Console → Project settings → Your apps → Web app
// 將以下欄位替換成你的專案設定；這些公開識別資訊可安全放在前端，資料安全由 firestore.rules 控制。
window.FIREBASE_CONFIG = {
  apiKey: "REPLACE_WITH_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};
