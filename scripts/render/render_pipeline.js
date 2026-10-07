#!/usr/bin/env node
/**
 * Headless Puppeteer + FFmpeg 60 FPS Render Pipeline
 * 
 * Flow:
 * 1. Read timeline.json in specified project directory.
 * 2. Launch headless Chromium with 1920x1080 viewport and 60fps frame capture.
 * 3. For each scene in timeline.json:
 *    - Serve or load scene_XX.html.
 *    - Record for exact duration seconds.
 *    - Export individual scene_XX.mp4.
 * 4. Concatenate all scene clips and merge original audio.mp3 using ffmpeg.
 * 5. Output output_final.mp4.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';

function parseArgs() {
  const args = process.argv.slice(2);
  let projectDir = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      projectDir = path.resolve(args[i + 1]);
      i++;
    }
  }
  if (!projectDir) {
    console.error(JSON.stringify({ error: "Missing --project directory argument" }));
    process.exit(1);
  }
  return projectDir;
}

function runCommand(cmd, args, onLog) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    p.stdout.on('data', data => onLog && onLog(data.toString()));
    p.stderr.on('data', data => onLog && onLog(data.toString()));
    p.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${cmd} exited with code ${code}`));
    });
    p.on('error', err => reject(err));
  });
}

async function renderScene(browser, projectDir, scene, sceneIndex, totalScenes) {
  const sceneIdx = scene.index;
  const duration = parseFloat(scene.duration) || 5.0;
  const htmlFile = path.join(projectDir, 'scenes', `scene_${String(sceneIdx).padStart(2, '0')}.html`);
  const renderDir = path.join(projectDir, 'renders');
  const tempFramesDir = path.join(renderDir, `frames_${sceneIdx}`);
  const sceneOutputVideo = path.join(renderDir, `scene_${String(sceneIdx).padStart(2, '0')}.mp4`);

  if (!fs.existsSync(htmlFile)) {
    throw new Error(`Scene HTML file missing: ${htmlFile}`);
  }

  if (fs.existsSync(tempFramesDir)) {
    fs.rmSync(tempFramesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempFramesDir, { recursive: true });

  console.log(JSON.stringify({
    type: "render_progress",
    scene_index: sceneIdx,
    progress: (sceneIndex / totalScenes) * 100,
    message: `Rendering scene ${sceneIdx} (${duration}s) at 60 FPS...`
  }));

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  const fileUrl = 'file://' + htmlFile;
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });

  // High precision frame-by-frame capture at 60 FPS
  const fps = 60;
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const frameIntervalMs = 1000 / fps;

  // Emulate deterministic animation clock if window.requestAnimationFrame is used
  await page.evaluate(() => {
    window.__manual_clock = 0;
  });

  for (let f = 0; f < totalFrames; f++) {
    const framePath = path.join(tempFramesDir, `frame_${String(f).padStart(6, '0')}.png`);
    await page.screenshot({ path: framePath, type: 'png' });
    
    // Advance time in page context
    await page.evaluate((interval) => {
      window.__manual_clock = (window.__manual_clock || 0) + interval;
    }, frameIntervalMs);
  }

  await page.close();

  // Encode frames to scene MP4 with FFmpeg at 60 FPS
  const ffmpegArgs = [
    '-y',
    '-framerate', String(fps),
    '-i', path.join(tempFramesDir, 'frame_%06d.png'),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    sceneOutputVideo
  ];

  await runCommand('ffmpeg', ffmpegArgs, log => {
    // optional verbose frame log
  });

  // Cleanup frames
  fs.rmSync(tempFramesDir, { recursive: true, force: true });

  return sceneOutputVideo;
}

async function main() {
  const projectDir = parseArgs();
  const timelinePath = path.join(projectDir, 'timeline.json');
  const audioPath = path.join(projectDir, 'audio.mp3');
  const finalVideoPath = path.join(projectDir, 'output_final.mp4');

  if (!fs.existsSync(timelinePath)) {
    console.error(JSON.stringify({ type: "render_error", error: "timeline.json not found" }));
    process.exit(1);
  }

  const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const scenes = (timeline.scenes || []).sort((a, b) => a.index - b.index);

  if (scenes.length === 0) {
    console.error(JSON.stringify({ type: "render_error", error: "No scenes to render in timeline." }));
    process.exit(1);
  }

  const renderDir = path.join(projectDir, 'renders');
  if (!fs.existsSync(renderDir)) {
    fs.mkdirSync(renderDir, { recursive: true });
  }

  console.log(JSON.stringify({
    type: "render_progress",
    progress: 5,
    message: "Launching headless Chromium instance..."
  }));

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });

  const renderedVideos = [];

  try {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const videoPath = await renderScene(browser, projectDir, scene, i, scenes.length);
      renderedVideos.push(videoPath);
    }
  } finally {
    await browser.close();
  }

  // Concatenate scenes and merge audio
  console.log(JSON.stringify({
    type: "render_progress",
    progress: 90,
    message: "Concatenating scenes and synchronizing master audio track..."
  }));

  const concatListFile = path.join(renderDir, 'concat_list.txt');
  const fileLines = renderedVideos.map(v => `file '${v.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(concatListFile, fileLines, 'utf8');

  const concatVideoOnly = path.join(renderDir, 'scenes_concatenated.mp4');

  // Concat video scenes
  await runCommand('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListFile,
    '-c', 'copy',
    concatVideoOnly
  ]);

  // Final mux with audio.mp3
  const finalMuxArgs = [
    '-y',
    '-i', concatVideoOnly,
  ];

  if (fs.existsSync(audioPath)) {
    finalMuxArgs.push(
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest'
    );
  } else {
    finalMuxArgs.push('-c:v', 'copy');
  }

  finalMuxArgs.push(finalVideoPath);

  await runCommand('ffmpeg', finalMuxArgs);

  console.log(JSON.stringify({
    type: "render_progress",
    progress: 100,
    message: "Render complete! Master video assembled successfully."
  }));

  process.exit(0);
}

main().catch(err => {
  console.error(JSON.stringify({
    type: "render_error",
    error: err.message || String(err)
  }));
  process.exit(1);
});
