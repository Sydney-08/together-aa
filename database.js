const TripDatabase = (() => {
  const DB_NAME = 'together-aa-database';
  const STORE_NAME = 'trip-reports';

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('archivedAt', 'archivedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function useStore(mode, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = callback(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
  }

  return {
    save: report => useStore('readwrite', store => store.put(report)),
    all: () => useStore('readonly', store => store.getAll()).then(items => items.sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt))),
    remove: id => useStore('readwrite', store => store.delete(id))
  };
})();
