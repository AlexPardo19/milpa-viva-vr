import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--remote-debugging-port=9788',
  '--window-size=1280,800',
  'http://localhost:5173/'
]);

setTimeout(() => {
  http.get('http://localhost:9788/json', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const tabs = JSON.parse(data);
      const tab = tabs.find(t => t.url.includes('5173'));
      if (!tab) {
        console.error('No tab found on port 5173');
        chrome.kill();
        process.exit(1);
      }

      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));

        // 1. Enter field in FPS mode and equip Azada
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 2,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
                // Press Enter to enter the field
                window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
                // Equip azada
                window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
                if (window.controladorJugador) {
                  window.controladorJugador.activarModo("fps");
                  window.controladorJugador.teletransportarA(new BABYLON.Vector3(-2.0, 1.55, -1.25));
                  window.controladorJugador.camaraFPS.rotation.y = 0;
                  window.controladorJugador.camaraFPS.rotation.x = 0.22;
                }
              })()`
            }
          }));
        }, 2200);

        // 2. Capture screenshot 1: First Person View holding Azada in front of furrow
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 10, method: 'Page.captureScreenshot', params: { format: 'png' } }));
        }, 3600);

        // 3. Till station 0: Swing azada 3 times to create 3D furrows, then equip seeds
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 3,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
                // Till 3 times
                window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
                window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
                window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
                // Equip seeds
                window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
              })()`
            }
          }));
        }, 4600);

        // 4. Capture screenshot 2: Tilled soil with 3D furrows and seed bag in hand
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 20, method: 'Page.captureScreenshot', params: { format: 'png' } }));
        }, 6000);

        // 5. Walk over directly in front of Don Elote and talk to him
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 4,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
                if (window.controladorJugador && window.espantapajaros) {
                  window.controladorJugador.camaraFPS.position.set(-2.1, 1.55, -0.95);
                  window.controladorJugador.camaraFPS.setTarget(new BABYLON.Vector3(-2.85, 1.65, 0.45));

                  // Trigger fascinating trivia fact
                  window.espantapajaros.compartirSiguienteDato();
                }
              })()`
            }
          }));
        }, 7000);

        // 6. Capture screenshot 3: Don Elote sharing rich maize trivia
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 30, method: 'Page.captureScreenshot', params: { format: 'png' } }));
        }, 8800);
      };

      ws.onmessage = (event) => {
        if (event.data) {
          const parsed = JSON.parse(event.data);
          if (parsed.id === 10) {
            fs.writeFileSync('screenshot_inmersivo_fps_azada.png', Buffer.from(parsed.result.data, 'base64'));
            console.log('Saved screenshot_inmersivo_fps_azada.png');
          }
          if (parsed.id === 20) {
            fs.writeFileSync('screenshot_inmersivo_arando_tierra.png', Buffer.from(parsed.result.data, 'base64'));
            console.log('Saved screenshot_inmersivo_arando_tierra.png');
          }
          if (parsed.id === 30) {
            fs.writeFileSync('screenshot_inmersivo_don_elote_trivia.png', Buffer.from(parsed.result.data, 'base64'));
            console.log('Saved screenshot_inmersivo_don_elote_trivia.png');
            ws.close();
            chrome.kill();
            process.exit(0);
          }
        }
      };
    });
  }).on('error', (err) => {
    console.error('HTTP ERROR:', err);
    chrome.kill();
    process.exit(1);
  });
}, 1500);
