import { auth, db } from "./firebase.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { uploadImage } from "./services.js";
import { initials } from "./utils.js";

const form = document.querySelector("#onboardingForm"), status = document.querySelector("#status");
const avatarWrap = document.querySelector("#avatarPreviewWrap"), avatarInitials = document.querySelector("#avatarInitials"), avatarInput = document.querySelector("#avatarInput");
let selectedFile = null;

if (avatarWrap && avatarInput) {
  avatarWrap.addEventListener('click', () => avatarInput.click());
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files[0];
    if (!file) return;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      avatarWrap.innerHTML = `<img src="${ev.target.result}" alt="Selected photo"><span class="cam-badge"><i data-lucide="camera"></i></span>`;
      window.lucide?.createIcons();
    };
    reader.readAsDataURL(file);
  });
}

document.querySelector('#fullName')?.addEventListener('input', e => {
  if (!selectedFile && avatarInitials) avatarInitials.textContent = initials(e.target.value) || '+';
});

function updateProgress() {
  const fields = ['fullName', 'course', 'branch', 'year', 'section', 'college', 'bio'];
  const filled = fields.filter(id => document.getElementById(id) && document.getElementById(id).value.trim()).length;
  const pct = Math.max(20, Math.round((filled / fields.length) * 100));
  const bar = document.getElementById('onbProgress');
  if (bar) bar.style.width = pct + '%';
  const lbl = document.getElementById('onbProgressPct');
  if (lbl) lbl.textContent = pct + '% completed';
}
if (form) form.addEventListener('input', updateProgress);

function prefillFields(data) {
  if (!data) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val && !el.value) el.value = val;
  };
  setVal('fullName', data.displayName || data.name);
  setVal('course', data.course);
  setVal('branch', data.branch);
  setVal('year', data.year);
  setVal('section', data.section);
  setVal('college', data.college);
  setVal('bio', data.bio);

  const photo = data.photoURL;
  if (photo && avatarWrap) {
    avatarWrap.innerHTML = `<img src="${photo}" alt="Avatar"><span class="cam-badge"><i data-lucide="camera"></i></span>`;
    window.lucide?.createIcons();
  } else if (data.displayName && avatarInitials) {
    avatarInitials.textContent = initials(data.displayName) || '+';
  }
  updateProgress();
}

if (!auth) {
  try {
    const demo = JSON.parse(localStorage.getItem('cc-demo-profile') || '{}');
    prefillFields(demo);
  } catch (e) {}

  if (form) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      status.textContent = "Saving profile…";
      const value = id => document.querySelector("#" + id)?.value.trim() || '';
      const name = value("fullName") || "Student";
      const demoData = {
        displayName: name,
        course: value("course") || "B.Tech",
        branch: value("branch") || "CSE",
        year: value("year") || "3rd Year",
        section: value("section") || "A",
        college: value("college") || "Campus Connect One",
        bio: value("bio")
      };
      try { localStorage.setItem('cc-demo-profile', JSON.stringify(demoData)); } catch (err) {}
      sessionStorage.setItem('cc-just-registered', '1');
      status.textContent = "Profile saved!";
      setTimeout(() => location.href = "home.html", 350);
    });
  }
} else {
  onAuthStateChanged(auth, async user => {
    if (!user) { location.href = "login.html"; return; }

    const ref = doc(db, "users", user.uid);
    try {
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : {};
      prefillFields({ displayName: user.displayName, photoURL: user.photoURL, ...existing });
    } catch (e) {
      prefillFields({ displayName: user.displayName, photoURL: user.photoURL });
    }

    if (form) {
      form.addEventListener("submit", async e => {
        e.preventDefault();
        status.textContent = "Saving…";
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        const value = id => document.querySelector("#" + id)?.value.trim() || '';
        try {
          const displayName = value("fullName") || user.displayName || "Student";
          let photoURL = user.photoURL || '';
          if (selectedFile) {
            status.textContent = "Uploading photo…";
            photoURL = await uploadImage(selectedFile, `users/${user.uid}/avatar-${Date.now()}`, pct => status.textContent = `Uploading photo… ${pct}%`);
          }
          status.textContent = "Saving…";
          const college = value("college");
          await setDoc(ref, {
            uid: user.uid,
            displayName,
            name: displayName,
            photoURL,
            course: value("course"),
            branch: value("branch"),
            year: value("year"),
            section: value("section"),
            college,
            collegeKey: college ? college.toLowerCase() : 'campus connect',
            bio: value("bio"),
            searchName: displayName.toLowerCase(),
            updatedAt: serverTimestamp()
          }, { merge: true });

          if (auth.currentUser) await updateProfile(auth.currentUser, { displayName, photoURL: photoURL || undefined }).catch(() => {});
          sessionStorage.setItem('cc-just-registered', '1');
          status.textContent = "Profile saved.";
          setTimeout(() => location.href = "home.html", 400);
        } catch (err) {
          status.textContent = err.message || "Could not save profile.";
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }
  });
}
