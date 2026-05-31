# Wave Player — Instalación

## Requisitos
- [Node.js](https://nodejs.org) v18 o superior (descarga el instalador LTS)

## Pasos para generar el .exe

### 1. Instala las dependencias
Abre una terminal en esta carpeta y ejecuta:
```
npm install
```

### 2. Prueba la app en modo desarrollo (opcional)
```
npm run electron:dev
```
Esto abre la app directamente sin compilar.

### 3. Genera el instalador .exe
```
npm run electron:build
```

El instalador aparece en: `dist-electron/Wave Player Setup 1.0.0.exe`

---

## Notas
- El ícono por defecto es un placeholder. Reemplaza `public/icon.ico` con tu propio .ico (256x256) para personalizarlo.
- Si quieres compilar para Mac también, agrega `--mac` al comando de build.
- El instalador permite elegir carpeta de instalación y crea acceso directo en el escritorio.
