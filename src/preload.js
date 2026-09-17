const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("api", {
  exists: () => ipcRenderer.invoke("exists"),
  create: (key, password, name) => ipcRenderer.invoke("create", key, password, name),
  unlock: password => ipcRenderer.invoke("unlock", password),
  lock: () => ipcRenderer.invoke("lock"),
  list: () => ipcRenderer.invoke("list"),
  add: (key, name) => ipcRenderer.invoke("add", key, name),
  select: id => ipcRenderer.invoke("select", id),
  rename: (id, name) => ipcRenderer.invoke("rename", id, name),
  remove: id => ipcRenderer.invoke("remove", id),
  info: () => ipcRenderer.invoke("info"),
  trx: (to, amount) => ipcRenderer.invoke("trx", to, amount),
  usdt: (to, amount) => ipcRenderer.invoke("usdt", to, amount),
  open: txid => ipcRenderer.invoke("open", txid)
});
