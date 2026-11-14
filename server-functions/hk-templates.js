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
  const { hackathon: h, reg, round, note } = c;
  const who = esc(reg.name || "there");
  const team = reg.teamMode === "team" && reg.teamName ? ` (team <b>${esc(reg.teamName)}</b>)` : "";
  const title = esc(h.title);
  const rn = round ? esc(round) : "the next round";
  switch (kind) {
    case "registration_confirmation":
      return { subject: `You're registered: ${h.title}`, head: "Registration confirmed", lines: [
        `Hi ${who}, your registration${team} for <b>${title}</b> is confirmed.`,
        `<b>When:</b> ${esc(fmt(h.startMs))} to ${esc(fmt(h.endMs))}<br><b>Where:</b> ${esc(h.mode === "online" ? "Online" : [h.venue, h.college, h.city].filter(Boolean).join(", ") || "To be announced")}`,
        "Keep an eye on your dashboard for rounds, the test and project submission. You will also hear from us here when your status changes."] , cta: "Open my dashboard" };
    case "shortlisted":
      return { subject: `Shortlisted: ${h.title}`, head: "You're through", lines: [
        `Hi ${who}, congratulations! Your entry${team} for <b>${title}</b> has been shortlisted and moves on to <b>${rn}</b>.`,
        "Open your dashboard to see the next steps and deadlines."], cta: "See next steps" };
    case "selected":
      return { subject: `Selected: ${h.title}`, head: "You've been selected", lines: [
        `Hi ${who}, great news. Your entry${team} has been <b>selected</b> in <b>${title}</b>.`,
        "The organisers will share the final details with you shortly."], cta: "Open my dashboard" };
    case "waitlisted":
      return { subject: `Waitlisted: ${h.title}`, head: "You're on the waitlist", lines: [
        `Hi ${who}, your entry${team} for <b>${title}</b> is currently on the <b>waitlist</b>.`,
        "If a spot opens up we will email you right away. No action is needed from your side."], cta: "View status" };
    case "rejected":
      return { subject: `Update on your application: ${h.title}`, head: "Application update", lines: [
        `Hi ${who}, thank you for applying to <b>${title}</b>${team ? " with your team" : ""}. After careful review we are unable to move your entry forward this time.`,
        "We really appreciate the effort you put in and hope to see you at the next one."], cta: "Explore more hackathons" };
    case "submission_reminder":
      return { subject: `Reminder: submit your project for ${h.title}`, head: "Submission reminder", lines: [
        `Hi ${who}, a quick reminder to submit your idea / project links / presentation for <b>${title}</b>${team}.`,
        "Submit from your dashboard before the deadline so the judges can evaluate your work."], cta: "Submit project" };
    case "test_reminder":
      return { subject: `Reminder: your test for ${h.title}`, head: "Test reminder", lines: [
        `Hi ${who}, your screening test for <b>${title}</b> is waiting. Make sure you take it within the test window.`,
        "You can start it from your dashboard."], cta: "Open dashboard" };
    default:
      return { subject: `Message from the organisers: ${h.title}`, head: "A message from the organisers", lines: [`Hi ${who},`], cta: "Open my dashboard" };
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
