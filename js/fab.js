
const fab = document.createElement('button');
fab.className = 'fab';
fab.id = 'quickPostFab';
fab.innerHTML = '<i data-lucide="plus"></i>';
document.body.appendChild(fab);

fab.addEventListener('click', () => {
    import('./utils.js').then(({ showModal }) => {
      const modal = showModal('Quick Action', `
        <div class="stack">
          <button class="btn primary" id="fabPost"><i data-lucide="plus"></i>Create Post</button>
          <button class="btn" id="fabIssue"><i data-lucide="shield-alert"></i>Raise Issue</button>
        </div>
      `);
      modal.querySelector('#fabPost').addEventListener('click', () => {
        modal.remove();
        location.href = 'feed.html?compose=1';
      });
      modal.querySelector('#fabIssue').addEventListener('click', () => {
        modal.remove();
        location.href = 'issues.html?raise=1';
      });
    });
});
window.lucide?.createIcons();
