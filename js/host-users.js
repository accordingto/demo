// 主持人頁：使用者管理（只有擁有者、雲端模式才看得到）。需先載入 host-library.js（cloudCall、cloud、fmtDate）、host.js（copyText）
// 密碼由擁有者設定（也可以按 Generate 產生一組隨機的）；資料庫只存加鹽雜湊，所以設定後就看不到了
let isOwner = false;

function syncUsersBtn() {   // 擁有者 + 雲端模式才有「Manage users」
  const on = isOwner && cloud;
  $('libUsers').classList.toggle('hidden', !on);
  if (!on) $('usersPanel').classList.add('hidden');
}
function setOwner(v) { isOwner = !!v; syncUsersBtn(); }

const userMsg = (t, err) => { $('userMsg').className = err ? 'msg err' : 'meta'; $('userMsg').textContent = t; };
const randomPassword = () => { const b = crypto.getRandomValues(new Uint8Array(15)); return btoa(String.fromCharCode(...b)).replace(/\+/g, 'x').replace(/\//g, 'y').replace(/=+$/, ''); };   // 20 個字母數字
$('userGen').addEventListener('click', () => { $('userPass').value = randomPassword(); $('userPass').focus(); });

async function loadUsers() {
  try {
    const { users } = await cloudCall({ action: 'users_list' });
    $('userList').innerHTML = users.length
      ? `<table class="libtable"><thead><tr><th class="c-t">Name</th><th class="c-level">Status</th><th class="c-num c-words">Articles</th><th class="c-when">Created</th><th class="c-act"><span class="sr">Actions</span></th></tr></thead><tbody>${users.map((u) =>
        `<tr data-name="${esc(u.name)}" data-n="${u.articles}"><td class="c-t"><div class="t">${esc(u.name)}</div><div class="sub">${u.disabled ? 'Disabled' : 'Active'} · ${u.articles} article${u.articles === 1 ? '' : 's'}</div></td>` +
        `<td class="c-level"><span class="chip ${u.disabled ? 'warn' : 'lv'}">${u.disabled ? 'Disabled' : 'Active'}</span></td><td class="c-num c-words">${u.articles}</td><td class="c-when">${fmtDate(u.createdAt)}</td>` +
        `<td class="c-act"><div class="acts"><button type="button" class="act" data-uact="password">Set password</button><button type="button" class="act" data-uact="${u.disabled ? 'enable' : 'disable'}">${u.disabled ? 'Enable' : 'Disable'}</button><button type="button" class="act danger" data-uact="delete">Delete</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty-state"><strong>No users yet</strong>Add one above, then send them the access code that appears.</div>';
  } catch (e) { userMsg('❌ ' + e.message, true); }
}

$('libUsers').addEventListener('click', () => {
  const p = $('usersPanel'); p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) { userMsg(''); loadUsers(); }
});

$('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('userName').value.trim(), password = $('userPass').value.trim(); if (!name) return;
  $('userAdd').disabled = true; userMsg('Adding…');
  try {
    await cloudCall({ action: 'users_add', name, password });
    $('userName').value = ''; $('userPass').value = ''; userMsg(`Added “${name.toLowerCase()}”. Give them the password you set — they type it into “Access code”.`); await loadUsers();
  } catch (err) { userMsg('❌ ' + err.message, true); }
  finally { $('userAdd').disabled = false; }
});

$('userList').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-uact]'); if (!b) return;
  const row = b.closest('tr'), name = row.dataset.name, act = b.dataset.uact;
  try {
    if (act === 'password') {
      const pw = prompt(`New password for “${name}” (at least 8 characters).\nTheir current password stops working immediately.`); if (pw === null) return;
      await cloudCall({ action: 'users_password', name, password: pw }); userMsg(`Password for “${name}” changed.`);
    } else if (act === 'delete') {
      const n = Number(row.dataset.n) || 0;
      if (!confirm(`Delete “${name}” and ${n} article${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
      await cloudCall({ action: 'users_delete', name }); userMsg(`Deleted “${name}”.`);
    } else await cloudCall({ action: act === 'disable' ? 'users_disable' : 'users_enable', name });
    await loadUsers();
  } catch (err) { userMsg('❌ ' + err.message, true); }
});
