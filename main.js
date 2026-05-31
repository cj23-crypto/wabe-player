const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

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

  // Hide default menu bar
  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL("http://localhost:5173");
    // win.webContents.openDevTools(); // uncomment to debug
  } else {
    win.loadFile(path.join(process.resourcesPath, "dist", "index.html"));
  }

  win.once("ready-to-show", () => win.show());
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Allow loading local media files via IPC
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
