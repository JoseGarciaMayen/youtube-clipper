# ClipperStudio 🎬✨

Estudio de escritorio y orquestación para la producción de vídeos y animación visual, sincronizando locuciones en audio con animaciones HTML5 (Canvas/Tailwind) generadas por IA mediante **OpenCode CLI** y renderizadas a 60 FPS con **Puppeteer + FFmpeg**.

---

## 🏗 Arquitectura del Sistema

```
youtube-clipper/
├── client/                     # Frontend Desktop Studio (React + Tailwind CSS + Lucide + Electron)
│   ├── src/components/         # AudioTimeline, SceneCard, FullscreenPlayer, RenderBar, ProjectSelector
│   └── src/services/           # Cliente HTTP y WebSocket
├── server/                     # Backend Asíncrono (FastAPI + WebSockets)
│   ├── app/api/                # Endpoints REST para proyectos, timelines y escenas
│   ├── app/opencode_service.py # Orquestación multi-agente con OpenCode CLI (Generador + Revisor DeepSeek)
│   └── app/render_service.py   # Orquestador del pipeline Puppeteer + ffmpeg
├── scripts/render/             # Pipeline Headless 60 FPS (Puppeteer frame-by-frame + FFmpeg)
├── projects/                   # Almacenamiento local de proyectos generados
├── launch-studio.sh            # Lanzador de la app de escritorio
└── opencode.jsonc              # Configuración de subagentes para OpenCode CLI
```

---

## 🚀 Despliegue en Servidor Linux (Ubuntu 22.04 / 24.04 / Debian)

### 1. Dependencias del Sistema

Instala Node.js (v20+), Python (3.10+), FFmpeg y las bibliotecas gráficas necesarias para Chromium headless y audio:

```bash
# Actualizar paquetes
sudo apt-get update && sudo apt-get install -y \
    python3 python3-pip python3-venv \
    nodejs npm \
    ffmpeg \
    xvfb \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2
```

### 2. Configurar el Entorno del Proyecto

```bash
cd /home/jose/Proyectos/youtube-clipper

# 2.1 Configurar entorno Python para el backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt

# 2.2 Dependencias del pipeline de renderizado
cd scripts/render
npm install
npx puppeteer browsers install chrome
cd ../..

# 2.3 Compilar Frontend Web (PWA)
cd client
npm install
npm run build
cd ..
```

---

## 🤖 Configuración del CLI de OpenCode

El backend utiliza el binario de **OpenCode** para orquestar la generación de código y refinamiento visual de las escenas (`opencode.jsonc`):

1. Verifica que OpenCode esté en tu PATH o configurado en tu entorno:
   ```bash
   which opencode || echo $HOME/.opencode/bin/opencode
   ```
2. Si utilizas un proveedor como Claude 3.7 Sonnet o OpenAI, asegúrate de exportar tu API Key en el entorno del servidor:
   ```bash
   export ANTHROPIC_API_KEY="tu-api-key"
   # o
   export OPENAI_API_KEY="tu-api-key"
   ```

---

## 🔒 Acceso Remoto Seguro con Tailscale (Smartphone / PWA)

Para controlar la aplicación desde tu teléfono móvil de forma segura sin exponer puertos a internet público:

### En el Servidor Ubuntu:
```bash
# Instalar Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Anota la IP asignada (ejemplo: 100.x.y.z) o el nombre MagicDNS
```

### En tu Smartphone (iOS / Android):
1. Descarga la aplicación **Tailscale** e inicia sesión con la misma cuenta.
2. Abre el navegador móvil y accede a:
   ```
   http://100.x.y.z:8000
   ```
   *(O usa Tailscale Serve/Funnel con HTTPS automático si deseas soporte para Web Speech API en móviles que exijan HTTPS).*

---

## 📲 Uso de la Aplicación Móvil

1. **Subir Pista de Audio:** Sube el archivo `.mp3` o `.wav` con la locución en inglés.
2. **Modo "Tapping Timeline":**
   - Pulsa **Play** para escuchar el audio.
   - Presiona el botón gigante **"TAP TO SPLIT SCENE"** en cada cambio temático o de párrafo. El sistema dividirá y ajustará los timestamps de cada escena en tiempo real.
3. **Dictar o Escribir Indicaciones:**
   - En cada tarjeta de escena, pulsa el botón de micrófono para dictar el prompt visual con la **Web Speech API**.
4. **Generar Escena:**
   - Presiona **"Generate with OpenCode"**. OpenCode creará un canvas 1080p con fondo `#0b0f19` y animación calculada a la duración exacta de la escena.
   - Previsualiza el resultado en el reproductor embebido. Si necesitas cambios, usa el campo **Refine** (ej: *"Haz que los vectores roten más rápido"*).
5. **Renderizar MP4 Maestro:**
   - Pulsa **"Render Master MP4"**. El servidor ejecutará Chromium Headless a 60 FPS, unirá todas las tomas y ensamblará el vídeo final sincronizado listo para descargar.

---

## ⚙️ Ejecución con Systemd (Servicio en Segundo Plano)

Para mantener la aplicación siempre activa en tu máquina virtual:

```ini
# ~/.config/systemd/user/clipper-studio.service
[Unit]
Description=ClipperStudio Backend Service (FastAPI)
After=network.target

[Service]
Type=simple
User=jose
WorkingDirectory=/home/jose/Proyectos/youtube-clipper
Environment="PATH=/home/jose/Proyectos/youtube-clipper/.venv/bin:/home/jose/.opencode/bin:/usr/local/bin:/usr/bin"
ExecStart=/home/jose/Proyectos/youtube-clipper/.venv/bin/uvicorn server.app.main:app --host 0.0.0.0 --port 8080
Restart=on-failure
RestartSec=3s

[Install]
WantedBy=default.target
```

Habilita e inicia el servicio:
```bash
systemctl --user daemon-reload
systemctl --user enable --now clipper-studio
```
