// Save this as a bookmark or run in console to clear cache
// Paste this in your browser console (F12) to clear cache programmatically

(function clearCacheAndReload() {
  console.log('🧹 Clearing browser cache...');
  
  // Clear Service Workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(reg => reg.unregister());
      console.log('✅ Service workers cleared');
    });
  }
  
  // Clear Cache Storage API
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
      console.log('✅ Cache storage cleared');
    });
  }
  
  // Clear IndexedDB (preserve chat history)
  // Commented out to keep chat history
  // if ('indexedDB' in window) {
  //   indexedDB.databases().then(dbs => {
  //     dbs.forEach(db => indexedDB.deleteDatabase(db.name));
  //   });
  // }
  
  // Clear localStorage (except important keys)
  const preserve = ['bolt_theme', 'anonymousId'];
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && !preserve.includes(key)) {
      toRemove.push(key);
    }
  }
  toRemove.forEach(key => localStorage.removeItem(key));
  console.log('✅ LocalStorage cleaned');
  
  // Clear sessionStorage
  sessionStorage.clear();
  console.log('✅ SessionStorage cleared');
  
  console.log('✅ Cache clear complete!');
  console.log('🔄 Reloading page...');
  
  // Hard reload
  setTimeout(() => {
    location.reload(true);
  }, 1000);
})();
