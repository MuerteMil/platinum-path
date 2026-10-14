# Platinum Path

**Platinum Path** is a local desktop application designed to help you organize your Steam game library with a strong focus on achievements, completion status, and personal progress.

It is built as a **100% local, offline-first tool**, giving you full control over your data without subscriptions, accounts, or cloud dependencies.

---

## ✨ Features

- Import games from your Steam library (or add any game by name / AppID)
- Achievement progress, 100% tracking and "Almost 100%" detection
- **Estimated 100% difficulty** from global achievement rarity (your manual value always wins)
- Per-game achievement list: easiest/rarest first, **next target**, missable flags and personal notes
- Alert when Steam adds new achievements to a game you had at 100%
- Statistics: activity heatmap, achievements per month, 100% per year, streaks, rarest achievements
- Yearly 100% goal, personal priority order (drag & drop)
- Desktop notifications for new achievements and completions
- Quick links: play, store page, Steam achievements, guides
- Ratings, notes, status, manual hours and genres
- Backups (export / import) — your API key is never included
- Now playing detection, platinum showcase (export as image), collections, ignored games
- Achievement tags (missable, online, co-op, grindy, hard, bugged) plus **your own custom tags**, with filters
- HowLongToBeat time to 100% (unofficial), list view, system tray, 100% celebration
- Monthly / yearly recap, shareable as an image
- Setup assistant on first run (API key, profile and privacy check)
- Spanish / English interface
- Fully local storage (no accounts, no cloud). API key encrypted by the operating system (Windows DPAPI, or GNOME Keyring / KWallet on Linux)

---

## 🖥️ Platform

- **Windows** (installer or portable ZIP)
- **Linux** (AppImage or .deb), including **Steam Deck** in desktop mode

### Linux / Steam Deck

- **AppImage** (any distro, updates itself): download `Platinum-Path-x.y.z-x86_64.AppImage`, make it executable (right click → Properties → *Allow executing file as program*, or `chmod +x`) and open it. On Steam Deck, do this in Desktop Mode; you can then add it to Steam as a non-Steam game.
- **.deb** (Debian, Ubuntu, Mint, Pop!_OS…): `sudo apt install ./Platinum-Path-x.y.z-amd64.deb`. Updates are announced in the app with a link to the new version.
- The system tray icon needs tray support: KDE (and Steam Deck desktop mode) has it built in; GNOME needs the *AppIndicator* extension. Without it, use ⋯ → *Quit Platinum Path* to close the app completely.

---

## 🚀 How to Use

1. Download the installer (`Platinum-Path-Setup-x.y.z.exe`, with automatic updates) or the portable ZIP from **Releases**
2. Run it: the setup assistant guides you through the next two steps
3. Paste your [Steam Web API key](https://steamcommunity.com/dev/apikey) and your profile (SteamID64, profile URL or custom name)
4. Make sure your Steam profile's *Game details* are public
5. Click **Add games** and pick the ones you want to complete

> ⚠️ Windows may show a SmartScreen warning because the app is not digitally signed.  
> This is normal for indie/open-source projects.

---

## 💾 Data & Privacy

- All data is stored **locally on your computer** (Windows: `%APPDATA%\platinum-path`, Linux: `~/.config/platinum-path`; open it from the ⋯ menu)
- No analytics, tracking, or external servers
- You fully own your data

---

## 🧪 Project Status

Platinum Path is an **active work in progress**.

- New features may be added
- Bugs may exist
- Feedback is highly appreciated

---

## 🐛 Feedback & Bug Reports

If you find a bug or want to suggest a feature:

- Open an **Issue** on GitHub
- Or share feedback where you downloaded the app

Clear reproduction steps are always appreciated 🙏

---

## ❤️ Support the Project

Platinum Path is developed as a passion project.

If you find it useful and want to support its development, you can do so via voluntary donations (links available on the project page).

No features are locked behind payments.

---

## 📜 License

This project is licensed under the **MIT License**.

---

## 🛠️ Development

```bash
npm install
npm start          # run the app
npm test           # unit tests (logic, data migration)
npm run dist       # build installer + portable ZIP into dist/
npm run dist:linux # build AppImage + .deb into dist/ (run on Linux)
npm run release    # build and publish to GitHub Releases (needs GH_TOKEN)
```

**GitHub Actions** (`.github/workflows/build.yml`) builds both Windows and Linux on GitHub's machines, so no Linux computer is needed:

- *Actions → Build → Run workflow*: builds both and attaches the files to the run (nothing is published).
- Pushing a tag with the version number (e.g. `1.5.0`): builds both and uploads them to a draft release for that version.

On Windows you can also double-click **Run app.bat** (installs dependencies the first time and starts the app) or **Build installer.bat** (creates the installer and portable ZIP in `dist/`).

Test against a simulated Steam API (no key needed):

```bash
PP_USER_DATA=./tmp-data PP_MOCK_STEAM=test/mockSteam.js npm start
```

---

# Platinum Path (Español)

**Platinum Path** es una aplicación de escritorio local pensada para organizar tu biblioteca de juegos de Steam, con un enfoque especial en logros, completado al 100% y progreso personal.

Está diseñada como una herramienta **100% local**, sin cuentas, sin suscripciones y sin depender de la nube.

---

## ✨ Funcionalidades

- Importar juegos de tu biblioteca de Steam (o añadir cualquiera por nombre / AppID)
- Progreso de logros, seguimiento del 100% y detección de juegos «Casi al 100%»
- **Dificultad estimada del 100%** a partir de la rareza global de los logros (tu valor manual siempre manda)
- Lista de logros por juego: más fáciles/raros primero, **siguiente objetivo**, marca de perdibles y notas personales
- Aviso cuando Steam añade logros nuevos a un juego que tenías al 100%
- Estadísticas: mapa de actividad, logros por mes, 100% por año, rachas y logros más raros
- Objetivo anual de juegos al 100% y orden de prioridad personal (arrastrar y soltar)
- Notificaciones de escritorio de logros nuevos y juegos completados
- Accesos rápidos: jugar, tienda, logros en Steam y guías
- Puntuaciones, notas, estado, horas manuales y géneros
- Copias de seguridad (exportar / importar) — tu API key nunca se incluye
- Juego en curso detectado, vitrina de platinos (exportable como imagen), colecciones, juegos ignorados
- Etiquetas de logros (perdible, online, cooperativo, repetitivo, difícil, bugueado) y **etiquetas personalizadas**, con filtros
- Tiempo para el 100% de HowLongToBeat (no oficial), vista de lista, bandeja del sistema y celebración al 100%
- Resumen mensual / anual, exportable como imagen
- Asistente de configuración al primer inicio (API key, perfil y comprobación de privacidad)
- Interfaz en español e inglés
- Almacenamiento 100% local. La API key se guarda cifrada por el sistema (DPAPI en Windows, GNOME Keyring / KWallet en Linux)

---

## 🖥️ Plataforma

- **Windows** (instalador o ZIP portable)
- **Linux** (AppImage o .deb), también **Steam Deck** en modo escritorio

### Linux / Steam Deck

- **AppImage** (cualquier distribución, se actualiza sola): descarga `Platinum-Path-x.y.z-x86_64.AppImage`, dale permiso de ejecución (clic derecho → Propiedades → *Permitir ejecutar como programa*, o `chmod +x`) y ábrelo. En Steam Deck, hazlo en el modo escritorio; después puedes añadirlo a Steam como juego externo.
- **.deb** (Debian, Ubuntu, Mint, Pop!_OS…): `sudo apt install ./Platinum-Path-x.y.z-amd64.deb`. Las actualizaciones se avisan en la app con un enlace a la nueva versión.
- El icono de la bandeja necesita soporte de bandeja del sistema: KDE (y el modo escritorio de Steam Deck) lo tiene; GNOME necesita la extensión *AppIndicator*. Sin ella, usa ⋯ → *Salir de Platinum Path* para cerrar la app del todo.

---

## 🚀 Cómo usarla

1. Descarga el instalador (`Platinum-Path-Setup-x.y.z.exe`, con actualizaciones automáticas) o el ZIP portable desde **Releases**
2. Ábrelo: el asistente de configuración te guía en los dos pasos siguientes
3. Pega tu [Steam Web API key](https://steamcommunity.com/dev/apikey) y tu perfil (SteamID64, URL del perfil o nombre personalizado)
4. Asegúrate de que los *detalles de juego* de tu perfil de Steam son públicos
5. Pulsa **Añadir juegos** y elige los que quieras completar

> ⚠️ Windows puede mostrar un aviso de seguridad (SmartScreen).  
> Es normal en aplicaciones independientes sin certificado digital.

---

## 💾 Datos y privacidad

- Todos los datos se guardan **en tu propio ordenador** (Windows: `%APPDATA%\platinum-path`, Linux: `~/.config/platinum-path`; se abre desde el menú ⋯)
- No se recopila ningún tipo de información
- No hay servidores externos

---

## 🧪 Estado del proyecto

Platinum Path es un proyecto **en desarrollo activo**.

- Puede contener errores
- Las funciones pueden evolucionar
- El feedback es muy bienvenido

---

## 🐛 Reporte de errores y sugerencias

Si encuentras un error o quieres proponer mejoras:

- Abre un **Issue** en GitHub
- O deja feedback en la página de descarga

Si puedes explicar cómo reproducir el problema, ¡mejor!

---

## ❤️ Apoya el proyecto

Platinum Path es un proyecto hecho por pasión.

Si te resulta útil y quieres apoyar su desarrollo, puedes hacerlo mediante donaciones voluntarias (enlaces disponibles en la página del proyecto).

No hay funciones bloqueadas por pago.

---

## 📜 Licencia

Este proyecto se distribuye bajo la **Licencia MIT**.
