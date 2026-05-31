const { app, BrowserWindow, ipcMain, dialog, protocol } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// 1. REGISTRAR EL PROTOCOLO PRIVILEGIADO (DEBE IR ANTES DE QUE LA APP ESTÉ LISTA)
protocol.registerSchemesAsPrivileged([
  { scheme: "media", privileges: { bypassCSP: true, stream: true, secure: true, supportFetchAPI: true } }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 360,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0e0e0e",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "../public/icon.ico"),
    title: "Wave Player",
    show: false,
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL("http://localhost:5173");
    // win.webContents.openDevTools(); // Descomenta si necesitas ver la consola de errores
  } else {
    win.loadFile(path.join(process.resourcesPath, "dist", "index.html"));
  }

  win.once("ready-to-show", () => win.show());
}

// 2. MANEJAR EL PROTOCOLO CUANDO LA APP ESTÉ LISTA
app.whenReady().then(() => {
  protocol.registerFileProtocol("media", (request, callback) => {
    // Convierte "media:///C:/Ruta/Cancion.mp3" en "C:/Ruta/Cancion.mp3"
    let filePath = request.url.replace(/^media:\/\/\/?/, "");
    filePath = decodeURIComponent(filePath);
    
    try {
      return callback({ path: filePath });
    } catch (error) {
      console.error("Error al cargar el archivo en el protocolo media:", error);
    }
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("open-files", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Audio/Video", extensions: ["mp3","mp4","wav","flac","ogg","aac","m4a","webm","mkv","avi"] },
      { name: "Todos", extensions: ["*"] },
    ],
  });
  return result.filePaths;
});
