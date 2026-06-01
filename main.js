const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const AUDIO_EXTS = [".mp3",".mp4",".wav",".flac",".ogg",".aac",".m4a",".webm",".mkv",".avi",".opus"];

function getFilesFromFolder(folder) {
  try {
    return fs.readdirSync(folder)
      .filter(f => AUDIO_EXTS.includes(path.extname(f).toLowerCase()))
      .sort()
      .map(f => path.join(folder, f));
  } catch { return []; }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 360, minHeight: 600,
    backgroundColor: "#0a0a0f",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    title: "Wave Player",
    show: false,
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(process.resourcesPath, "dist", "index.html"));
  win.once("ready-to-show", () => win.show());
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Open individual files
ipcMain.handle("open-files", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio/Video", extensions: ["mp3","mp4","wav","flac","ogg","aac","m4a","webm","mkv","avi","opus"] }],
  });
  return result.filePaths;
});

// Open folder via dialog — returns { folderPath, paths }
ipcMain.handle("open-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths.length) return { folderPath: null, paths: [] };
  const folder = result.filePaths[0];
  return { folderPath: folder, paths: getFilesFromFolder(folder) };
});

// Load folder by path (used on startup to reload saved folder)
ipcMain.handle("open-folder-path", async (_, folderPath) => {
  return getFilesFromFolder(folderPath);
});
