// The page around the game: loading screen, title, toasts and the few modal
// dialogs (settings, confirm, help). The Gauntlet draws everything else.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export class Shell {
  constructor() {
    this.handlers = {};
    this.openModals = 0;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('#title button[data-act]');
      if (!b) return;
      this.emit('click');
      this.emit(b.dataset.act);
    });
  }

  on(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); return this; }
  emit(name, arg) { for (const fn of this.handlers[name] || []) fn(arg); }
  get modalOpen() { return this.openModals > 0; }
  get titleShown() { return !$('#title').hidden; }

  setLoading(text) { $('#loading .text').textContent = text; }
  hideLoading() { $('#loading').classList.add('gone'); setTimeout(() => { $('#loading').hidden = true; }, 700); }

  showTitle(canResume) {
    $('#title').hidden = false;
    $('[data-act="title-run"]').hidden = !canResume;
  }
  hideTitle() { $('#title').hidden = true; }

  toast(text, kind = '') {
    const box = $('#toasts');
    while (box.children.length > 2) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = text;
    box.append(t);
    setTimeout(() => t.remove(), 2400);
  }

  // Shows a modal and resolves with the data-act of the button pressed.
  modal(id, setup) {
    const box = $(id);
    box.hidden = false;
    this.openModals++;
    return new Promise((resolve) => {
      const done = (act) => {
        box.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        box.hidden = true;
        this.openModals--;
        resolve(act);
      };
      const onClick = (e) => {
        if (e.target === box) { done('cancel'); return; }
        const b = e.target.closest('button');
        if (!b) return;
        this.emit('click');
        if (b.dataset.act) done(b.dataset.act);
        else if (setup && setup.onButton) setup.onButton(b);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done('cancel'); } };
      box.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  async settings(values, onChange) {
    const box = $('#dlg-settings');
    const refresh = () => {
      for (const group of $$('[data-field]', box)) {
        const f = group.dataset.field;
        if (group.matches('input[type="checkbox"]')) group.checked = !!values[f];
        else if (group.matches('input')) group.value = values[f];
        else for (const b of $$('button', group)) b.classList.toggle('on', b.dataset.v === String(values[f]));
      }
    };
    const onButton = (b) => {
      const group = b.closest('[data-field]');
      if (!group) return;
      const f = group.dataset.field;
      values[f] = typeof values[f] === 'number' ? +b.dataset.v : b.dataset.v;
      refresh();
      onChange(f, values[f]);
    };
    const onInput = (e) => {
      const f = e.target.dataset.field;
      if (!f) return;
      values[f] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
      onChange(f, values[f]);
    };
    box.addEventListener('input', onInput);
    refresh();
    await this.modal('#dlg-settings', { onButton });
    box.removeEventListener('input', onInput);
  }

  async confirm(title, text, yes = 'Yes', no = 'No') {
    const box = $('#dlg-confirm');
    $('h2', box).textContent = title;
    $('.reason', box).textContent = text;
    $('[data-act="ok"]', box).textContent = yes;
    $('[data-act="cancel"]', box).textContent = no;
    return (await this.modal('#dlg-confirm')) === 'ok';
  }

  help() { return this.modal('#dlg-help'); }
}
