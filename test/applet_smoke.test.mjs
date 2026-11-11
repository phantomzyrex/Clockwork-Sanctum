import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

test('metadata.json and index.html are synchronized and complete', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata.json'), 'utf8'));
  assert.equal(meta.name, 'Clockwork Sanctum');
  assert.ok(meta.description.length > 20);
  assert.ok(Array.isArray(meta.requestFramePermissions));

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes(`<title>${meta.name}</title>`));
  assert.ok(html.includes(meta.description));
  assert.ok(html.includes('id="game-canvas"'));
  assert.ok(html.includes('id="hud-root"'));
});

test('all engine scripts and welcome screen sprites exist in public/', () => {
  const required = [
    'public/lib/three.min.js',
    'public/js/config.js',
    'public/js/levels.js',
    'public/js/textures.js',
    'public/js/world.js',
    'public/js/contraptions.js',
    'public/js/units.js',
    'public/js/vfx-post.js',
    'public/js/audio.js',
    'public/js/simulation.js',
    'public/js/hud.js',
    'public/js/main.js',
    'public/assets/welcome/logo_crest.png',
    'public/assets/welcome/btn_play.png',
    'public/assets/welcome/btn_islands.png',
    'public/assets/welcome/mascot_warrior.png',
    'public/assets/welcome/mascot_rogue.png',
    'public/assets/welcome/mascot_mage.png',
    'public/assets/welcome/cube_music.png',
    'public/assets/welcome/cube_stars.png',
    'public/assets/welcome/cube_guide.png',
    'public/assets/welcome/cube_gear.png',
  ];
  for (const rel of required) {
    const full = path.join(ROOT, rel);
    assert.ok(fs.existsSync(full), `Missing ${rel}`);
    assert.ok(fs.statSync(full).size > 100, `Empty ${rel}`);
  }
});
