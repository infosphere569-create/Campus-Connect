"use strict";
// Email templates for the Hackathons module. Pure functions: no I/O, fully unit-testable.
// Every mail is sent from team@campusconnectone.online and signed with the host / organiser name.

const FROM_ADDRESS = "team@campusconnectone.online";
const FROM_NAME = "Campus Connect Hackathons";
const PORTAL = "https://campusconnectone.online/hackthons-portal.html";

const esc = (v = "") => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl2br = s => esc(s).replace(/\r?\n/g, "<br>");
const fmt = ms => ms ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(ms)) + " IST" : "To be announced";

// kind -> label shown in the host's "Notify Team" picker
const KINDS = {
  registration_confirmation: "Registration confirmed",
  shortlisted: "Shortlisted / moved to next round",
  selected: "Selected (finalist / winner)",
  waitlisted: "Waitlisted",
  rejected: "Not selected",
  submission_reminder: "Reminder: submit your project",
  test_reminder: "Reminder: take the test",
  custom: "Custom message"
};

function hostLine(h) {
  const o = h.organiser || {};
  const name = o.name || h.hostName || "The organising team";
  const org = h.brandName && h.brandName !== name ? h.brandName : "";
  return { name, org, email: o.email || h.contactEmail || "", phone: o.phone || h.contactPhone || "", designation: o.designation || "" };
}

function content(kind, c) {
  const { hackathon: h, reg, round, note, scheduleText, meetLink, customSubject } = c;
  const who = esc(reg.name || "there");
  const team = reg.teamMode === "team" && reg.teamName ? ` (team <b>${esc(reg.teamName)}</b>)` : "";
  const title = esc(h.title);
  const rn = round ? esc(round) : "the next round";
  const venueStr = h.mode === "online" ? "Online" : ([h.venue, h.college, h.city].filter(Boolean).join(", ") || "To be announced");
  const dateStr = `${fmt(h.startMs)} to ${fmt(h.endMs)}`;
  const schedLine = scheduleText ? `<br><b>Schedule / Timing:</b> ${esc(scheduleText)}` : "";
  const meetLine = meetLink ? `<br><b>Reporting / Meet Link:</b> ${/^https?:\/\//i.test(meetLink) ? `<a href="${esc(meetLink)}" style="color:#178a54">${esc(meetLink)}</a>` : esc(meetLink)}` : "";
  const subDeadline = h.submission && h.submission.deadlineMs ? `<br><b>Submission deadline:</b> ${esc(fmt(h.submission.deadlineMs))}` : "";
  const subj = customSubject && String(customSubject).trim() ? String(customSubject).trim().slice(0, 140) : null;

  switch (kind) {
    case "registration_confirmation":
      return {
        subject: subj || `You're registered: ${h.title}`,
        head: "Registration confirmed",
        lines: [
          `Hi ${who}, your registration${team} for <b>${title}</b> is confirmed.`,
          `<b>When:</b> ${esc(dateStr)}<br><b>Where:</b> ${esc(venueStr)}${reg.teamMode === "team" && reg.teamName ? `<br><b>Team:</b> ${esc(reg.teamName)}` : ""}${schedLine}${meetLine}`,
          "Keep an eye on your dashboard for rounds, screening tests and project submission. You will also hear from us here when your status changes."
        ],
        cta: "Open my dashboard"
      };
    case "shortlisted":
      return {
        subject: subj || `Shortlisted: ${h.title} — ${round || "Next Round"}`,
        head: `You're shortlisted · ${round || "Next Round"}`,
        lines: [
          `Hi ${who}, congratulations! Your entry${team} for <b>${title}</b> has been <b>shortlisted</b> and moves forward to <b>${rn}</b>.`,
          `<b>Round / Stage:</b> ${rn}<br><b>Mode / Venue:</b> ${esc(venueStr)}${schedLine}${meetLine}`,
          "Open your dashboard to review complete round instructions, prepare your presentation or prototype, and check upcoming deadlines."
        ],
        cta: "See next steps"
      };
    case "selected":
      return {
        subject: subj || `Selected: ${h.title}`,
        head: "Congratulations — You've been selected",
        lines: [
          `Hi ${who}, great news! Your entry${team} has been <b>selected</b> in <b>${title}</b>${round ? ` (${rn})` : ""}.`,
          `<b>Event:</b> ${title}<br><b>Mode / Venue:</b> ${esc(venueStr)}${h.prizePool ? `<br><b>Prize Pool:</b> ₹${Number(h.prizePool).toLocaleString("en-IN")}` : ""}${schedLine}${meetLine}`,
          "Open your dashboard for confirmation and reporting instructions. Our organising team will coordinate next formalities with you."
        ],
        cta: "Open my dashboard"
      };
    case "waitlisted":
      return {
        subject: subj || `Waitlisted: ${h.title}`,
        head: "You're on the waitlist",
        lines: [
          `Hi ${who}, your entry${team} for <b>${title}</b> is currently on the <b>waitlist</b>${round ? ` (${rn})` : ""}.`,
          "If a confirmed spot opens up we will notify you right away via email and your participant dashboard. No action is needed from your side right now."
        ],
        cta: "View status"
      };
    case "rejected":
      return {
        subject: subj || `Update on your application: ${h.title}`,
        head: "Application update",
        lines: [
          `Hi ${who}, thank you for applying to <b>${title}</b>${team ? " with your team" : ""}. After careful evaluation by the judging panel, we are unable to move your entry forward at this stage.`,
          "This reflects the tight competition in this round and not your potential. We truly appreciate your effort and hope to see you build with us at future Campus Connect events."
        ],
        cta: "Explore more hackathons"
      };
    case "submission_reminder":
      return {
        subject: subj || `Reminder: submit your project for ${h.title}`,
        head: "Project submission reminder",
        lines: [
          `Hi ${who}, this is a quick reminder to submit your project idea, GitHub repository, live demo, and PPT deck for <b>${title}</b>${team}.`,
          `<b>Hackathon:</b> ${title}${subDeadline}${schedLine}${meetLine}`,
          "Submit directly from your participant dashboard before the deadline closes so judges can review and score your work."
        ],
        cta: "Submit project"
      };
    case "test_reminder":
      return {
        subject: subj || `Reminder: your screening test for ${h.title}`,
        head: "Screening test reminder",
        lines: [
          `Hi ${who}, your screening test for <b>${title}</b>${team} is active. Make sure you complete and submit your attempt within the scheduled test window.`,
          `<b>Hackathon:</b> ${title}${schedLine}${meetLine}`,
          "Ensure a stable internet connection, avoid refreshing during the timer, and launch the test from your participant dashboard."
        ],
        cta: "Open dashboard"
      };
    default:
      return {
        subject: subj || `Message from the organisers: ${h.title}`,
        head: subj || "Update from the organisers",
        lines: [
          `Hi ${who}, the organising team of <b>${title}</b>${team ? ` (for team <b>${esc(reg.teamName)}</b>)` : ""} has shared an important update with you.`,
          ...(schedLine || meetLine ? [`<b>Details:</b>${schedLine.replace(/^<br>/, " ")}${meetLine}`] : [])
        ],
        cta: "Open my dashboard"
      };
  }
}

function renderEmail(kind, ctx) {
  if (!KINDS[kind]) kind = "custom";
  const h = ctx.hackathon, host = hostLine(h);
  const c = content(kind, ctx);
  const noteHtml = ctx.note && String(ctx.note).trim()
    ? `<div style="margin:18px 0;padding:14px 16px;border-left:4px solid #178a54;background:#f1f8f4;border-radius:8px;color:#0f241a"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#178a54;margin-bottom:6px">Message from ${esc(host.name)}</div>${nl2br(ctx.note)}</div>` : "";
  const link = `${PORTAL}#/my/${encodeURIComponent(ctx.hackathonId || "")}`;
  const bodyLines = c.lines.map(l => `<p style="margin:0 0 14px;line-height:1.6">${l}</p>`).join("");
  const sig = `<p style="margin:22px 0 0;line-height:1.55">Regards,<br><b>${esc(host.name)}</b>${host.designation ? `<br>${esc(host.designation)}` : ""}${host.org ? `<br>${esc(host.org)}` : ""}${host.email ? `<br><a href="mailto:${esc(host.email)}" style="color:#178a54">${esc(host.email)}</a>` : ""}${host.phone ? ` · ${esc(host.phone)}` : ""}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#eef5f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f241a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5f0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d6e8dd">
<tr><td style="background:linear-gradient(135deg,#0c5535,#178a54);padding:22px 26px;color:#fff"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Campus Connect · Hackathons</div><div style="font-size:22px;font-weight:700;margin-top:6px">${esc(c.head)}</div></td></tr>
<tr><td style="padding:26px">${bodyLines}${noteHtml}
<p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#178a54;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${esc(c.cta)}</a></p>${sig}</td></tr>
<tr><td style="padding:16px 26px;background:#f6faf7;border-top:1px solid #d6e8dd;font-size:12px;color:#566f5f;line-height:1.5">Sent by Campus Connect One on behalf of <b>${esc(host.name)}</b> for <b>${esc(h.title)}</b>. Replies go to the organiser${host.email ? ` (${esc(host.email)})` : ""}.<br>© Campus Connect One · ${FROM_ADDRESS}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [c.head, "", ...c.lines.map(l => l.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "")), ctx.note ? `\nMessage from ${host.name}:\n${ctx.note}` : "", "", `${c.cta}: ${link}`, "", `Regards,\n${host.name}${host.org ? "\n" + host.org : ""}${host.email ? "\n" + host.email : ""}`].join("\n");
  return { subject: c.subject, html, text, kind };
}

module.exports = { renderEmail, KINDS, FROM_ADDRESS, FROM_NAME, PORTAL, esc };
