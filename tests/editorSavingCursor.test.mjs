import assert from 'node:assert/strict';
import test from 'node:test';
import { withEditorSavingCursor } from '../src/lib/editorSavingCursor.js';

function fixture() {
  const classes=new Set(),frames=new Map(),timeouts=new Map();let id=0;
  return { classes,frames,timeouts,document:{documentElement:{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}}},
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:fn=>{timeouts.set(++id,fn);return id;},clearTimeout:id=>timeouts.delete(id),
    paint(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();},
  };
}

test('wait cursor is set synchronously and two paints precede expensive save work', async()=>{
  const win=fixture(),events=[];
  const pending=withEditorSavingCursor(()=>{assert.ok(win.classes.has('editor-saving'));events.push('save');return 42;},win);
  assert.ok(win.classes.has('editor-saving'));assert.deepEqual(events,[]);
  win.paint();await Promise.resolve();assert.deepEqual(events,[]);
  win.paint();assert.equal(await pending,42);assert.deepEqual(events,['save']);
  assert.equal(win.classes.size,0);assert.equal(win.timeouts.size,0);assert.equal(win.frames.size,0);
});
test('validation or write failures always clear the wait cursor and scheduled callbacks',async()=>{
  const win=fixture();const pending=withEditorSavingCursor(()=>{throw Error('disk full');},win);
  win.paint();win.paint();await assert.rejects(pending,/disk full/);
  assert.equal(win.classes.size,0);assert.equal(win.timeouts.size,0);assert.equal(win.frames.size,0);
});
test('a hidden window falls back without waiting forever for animation frames',async()=>{
  const win=fixture();const pending=withEditorSavingCursor(()=>true,win);
  for(const fn of win.timeouts.values())fn();assert.equal(await pending,true);
  assert.equal(win.classes.size,0);assert.equal(win.frames.size,0);
});
