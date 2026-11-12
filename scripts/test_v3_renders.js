import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--remote-debugging-port=9777',
  '--window-size=1280,800',
  'http://localhost:5173/'
]);

setTimeout(() => {
  http.get('http://localhost:9777/json', (res) => {
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

        // 1. Initial screenshot: Pre-game lobby in the shed with 3D dials
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 10, method: 'Page.captureScreenshot', params: { format: 'png' } }));
        }, 2200);

        // 2. Click "¡IR AL CAMPO!" or press Enter to enter furrow
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 2,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
              })()`
            }
          }));
        }, 3200);

        // 3. Take screenshot of the furrow field in front of station 1
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 20, method: 'Page.captureScreenshot', params: { format: 'png' } }));
        }, 4600);

        // 4. Till and sow all 6 stations, advance 150 days of sun
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 3,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
                const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key: key }));

                // Work on each station 0 to 5
                for (let i = 0; i < 6; i++) {
                  press('1'); press('1'); press('1'); // Till
                  press('2');                         // Sow
                  press('3');                         // Water
                  press('4');                         // Fertilize
                  press('Tab');                       // Next station
                }

                // Advance days to R3 (10 * 15 days = 150 days)
                for (let d = 0; d < 10; d++) {
                  press('5');
                }

                // Harvest from plant 0 into the basket
                press('6');

                // Camera showing the whole furrow, plants, signs, cart, basket and scarecrow
                const scene = BABYLON.Engine.LastCreatedScene;
                if (scene && scene.activeCamera) {
                  scene.activeCamera.target = new BABYLON.Vector3(0, 0.85, 0);
                  scene.activeCamera.radius = 5.2;
                  scene.activeCamera.beta = Math.PI / 2.45;
                  scene.activeCamera.alpha = -Math.PI / 2.0;
                }
              })()`
            }
          }));
        }, 6000);

        // 5. Final screenshot: Growing milpa with varieties
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 30, method: 'Page.captureScreenshot', params: { format: 'png' } }));
        }, 9500);
      };

      ws.onmessage = (event) => {
        if (event.data) {
          const parsed = JSON.parse(event.data);
          if (parsed.id === 10) {
            fs.writeFileSync('screenshot_v3_cobertizo_clima.png', Buffer.from(parsed.result.data, 'base64'));
            console.log('Saved screenshot_v3_cobertizo_clima.png');
          }
          if (parsed.id === 20) {
            fs.writeFileSync('screenshot_v3_surco_campo.png', Buffer.from(parsed.result.data, 'base64'));
            console.log('Saved screenshot_v3_surco_campo.png');
          }
          if (parsed.id === 30) {
            fs.writeFileSync('screenshot_v3_crecimiento_variedades.png', Buffer.from(parsed.result.data, 'base64'));
            console.log('Saved screenshot_v3_crecimiento_variedades.png');
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
