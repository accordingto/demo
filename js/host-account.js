// 使用者自己修改存取碼（擁有者的碼在 Vercel 環境變數 HOST_CODE，不能在這裡改）。需在 host-main.js 之後載入。
(function () {
  const dlg = $('pwDialog'), n1 = $('pwNew'), n2 = $('pwNew2'), msg = $('pwMsg'), save = $('pwSave');
  const btns = [...document.querySelectorAll('.changecode')];
  const showMsg = (t) => { msg.textContent = t; msg.classList.toggle('hidden', !t); };
  const close = () => { dlg.classList.add('hidden'); n1.value = n2.value = ''; showMsg(''); };

  // 只有已登入的一般使用者才看得到「Change my access code」
  document.addEventListener('codestatus', (e) => btns.forEach((b) => b.classList.toggle('hidden', !(e.detail.kind === 'ok' && !e.detail.owner))));

  btns.forEach((b) => b.addEventListener('click', () => {
    closeCodePop?.(); closeNav?.();
    dlg.classList.remove('hidden'); showMsg(''); setTimeout(() => n1.focus(), 50);
  }));
  $('pwCancel').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dlg.classList.contains('hidden')) close(); });

  async function submit() {
    const a = n1.value.trim(), b = n2.value.trim();
    if (a.length < 8 || a.length > 100) return showMsg('The access code must be 8–100 characters.');
    if (a !== b) return showMsg('The two codes are not the same.');
    save.disabled = true; showMsg('');
    try {
      await postJson('/api/library', { action: 'password_change', code: $('code').value.trim(), newPassword: a });
      $('code').value = a;   // 馬上改用新的碼：存起來並重新確認登入
      $('code').dispatchEvent(new Event('input', { bubbles: true })); $('code').dispatchEvent(new Event('change', { bubbles: true }));
      close(); toast('Your access code was changed.');
    } catch (e) { showMsg(e.message); }
    finally { save.disabled = false; }
  }
  save.addEventListener('click', submit);
  for (const i of [n1, n2]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
})();
