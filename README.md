# 一起 AA

適合旅行、聚餐與團體活動的多行程、多人分帳網頁 App。

## 使用方式

直接以瀏覽器開啟 `index.html`，或在此資料夾執行靜態伺服器：

```powershell
npx serve .
```

首頁可以建立及切換多個獨立行程／帳本。每個帳本各自保存成員、日期與花費，並支援刪除成員、任一成員代墊、選擇分攤者、自動最佳化還款筆數、刪除花費、複製結算結果，以及封存歷史報表。舊版的單一帳本會自動遷移成首頁中的第一個行程。

未登入時，所有行程集合儲存在 `localStorage`，封存報表儲存在 `IndexedDB`；Google 登入後，完整行程集合與歷史報表都會同步至該 UID 的 Firestore 空間。

建議透過本機靜態伺服器開啟，而非直接雙擊檔案，以確保 IndexedDB 與剪貼簿功能正常運作。

## 下一階段

## Firebase、Google 登入與 Email 提醒設定

1. 在 Firebase Console 建立專案與 Web App，將 Web App 設定貼入 `firebase-config.js`。
2. Authentication → Sign-in method 啟用 Google，並把 GitHub Pages 或正式網域加入 Authorized domains。
3. 建立 Cloud Firestore Database。
4. 複製 `.firebaserc.example` 為 `.firebaserc`，填入 Firebase Project ID。
5. 安裝 Firebase CLI，登入並部署：

```powershell
npm install -g firebase-tools
firebase login
cd functions
npm install
cd ..
firebase deploy
```

6. 在 Firebase Extensions 安裝官方 **Trigger Email from Firestore**，Collection 設為 `mail`，並提供 SendGrid、Mailgun 或其他 SMTP 服務的憑證。

Google 登入後，目前帳本位於 `users/{uid}/app/current`，封存報表位於 `users/{uid}/reports/{reportId}`，提醒設定位於 `users/{uid}/settings/reminder`。`firestore.rules` 限制只有相同 UID 可以讀寫自己的資料。

Email 排程使用 Cloud Functions 與 Cloud Scheduler，因此需要 Firebase Blaze 方案。排程每小時執行一次，依使用者設定的時區、星期與小時決定是否寄送；同一天不會重複寄送。

未設定 Firebase 或未登入時，App 仍可使用原本的本機 `localStorage` 與 `IndexedDB` 模式。
