// Client-side Automated Event-Driven Email Notification Engine & Dispatcher.
// Mirrors server-functions/email-notifications.js cleanly as a zero-dependency ES module
// so the Admin Studio can detect event types, edit {{placeholder}} variables, preview live HTML,
// export parameterized templates, and dispatch via Cloud Functions with resilient fallback logging.

import { db, auth } from './firebase.js';
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';

export const FROM_ADDRESS = 'team@campusconnectone.online';
export const FROM_NAME = 'Campus Connect One';
export const SUPPORT_EMAIL = 'support@campusconnectone.online';
export const BASE_URL = 'https://campusconnectone.online';

export const esc = (v = '') =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const nl2br = (v = '') => esc(v).replace(/\r?\n/g, '<br>');

function safeUrl(raw, fallback = BASE_URL) {
  const s = String(raw || '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return `${BASE_URL}${s}`;
  return fallback;
}

function toMs(val) {
  if (!val) return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val instanceof Date) return val.getTime();
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (typeof val === 'object' && typeof val.seconds === 'number') return val.seconds * 1000;
  const parsed = Date.parse(String(val));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function fmtDate(val, fallback = 'To be announced') {
  if (!val) return fallback;
  const ms = toMs(val);
  if (!ms) return String(val);
  try {
    return (
      new Intl.DateTimeFormat('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      }).format(new Date(ms)) + ' IST'
    );
  } catch {
    return new Date(ms).toUTCString();
  }
}

function normalizeStatusKey(status) {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export const EVENT_TYPES = {
  event_registration: {
    key: 'event_registration',
    label: 'Event Registration Confirmation',
    category: 'Campus Events',
    accent: '#4f46e5',
    accentSoft: '#eef2ff',
    badgeText: 'EVENT PASS',
    defaultSubject: 'Confirmed: {{eventTitle}} on {{eventDate}}',
    defaultHeadline: "You're registered for {{eventTitle}}",
    defaultGreeting: 'Hi {{recipientName}},',
    defaultIntro:
      'Your spot for <strong>{{eventTitle}}</strong> has been confirmed. Keep this confirmation handy for quick check-in at the venue.',
    defaultNoteLabel: 'Organizer Note',
    defaultNoteKey: 'organiserNote',
    defaultCtaLabel: 'View Event Details',
    defaultClosing:
      'Plans changed? You can manage your RSVP anytime directly from the Campus Events calendar.',
    details: [
      { label: 'Event', value: '{{eventTitle}}' },
      { label: 'Organizer', value: '{{eventOrganizer}}' },
      { label: 'Date & Time', value: '{{eventDate}}' },
      { label: 'Venue', value: '{{eventVenue}}' },
      { label: 'Registration ID', value: '{{registrationId}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Recipient Name', required: true, example: 'Aarav Sharma' },
      { key: 'recipientEmail', label: 'Recipient Email', required: true, example: 'aarav@campus.edu' },
      { key: 'eventTitle', label: 'Event Title', required: true, example: 'Campus Hacknight 2026' },
      { key: 'eventOrganizer', label: 'Organizer / Club', required: false, example: 'Campus Coders' },
      { key: 'eventDate', label: 'Event Date & Time', required: false, example: 'Fri, 20 Nov 2026, 10:00 AM IST' },
      { key: 'eventVenue', label: 'Event Venue', required: false, example: 'Main Lab Block B' },
      { key: 'registrationId', label: 'Registration Reference', required: false, example: 'EVT-94821' },
      { key: 'organiserNote', label: 'Organizer Note', required: false, example: 'Please bring your student ID card and laptop.' },
      { key: 'actionUrl', label: 'Dashboard / Event URL', required: false, example: 'https://campusconnectone.online/events.html' }
    ]
  },

  event_approved: {
    key: 'event_approved',
    label: 'Event Proposal Approved',
    category: 'Campus Events',
    accent: '#0d9488',
    accentSoft: '#f0fdfa',
    badgeText: 'PUBLISHED',
    defaultSubject: 'Approved & Live: {{eventTitle}} is now on Campus Calendar',
    defaultHeadline: 'Your event {{eventTitle}} is live',
    defaultGreeting: 'Hi {{recipientName}},',
    defaultIntro:
      'Great news! Your submitted event <strong>{{eventTitle}}</strong> has been reviewed and approved by the campus team. Students can now discover it and RSVP.',
    defaultNoteLabel: 'Moderation Note',
    defaultNoteKey: 'organiserNote',
    defaultCtaLabel: 'Open Events Calendar',
    defaultClosing:
      'Share your event link across campus communities to drive early registrations.',
    details: [
      { label: 'Event', value: '{{eventTitle}}' },
      { label: 'Hosted By', value: '{{eventOrganizer}}' },
      { label: 'Scheduled For', value: '{{eventDate}}' },
      { label: 'Venue', value: '{{eventVenue}}' },
      { label: 'Status', value: '{{eventStatus}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Organizer Name', required: true, example: 'Priya Patel' },
      { key: 'recipientEmail', label: 'Organizer Email', required: true, example: 'priya@campus.edu' },
      { key: 'eventTitle', label: 'Event Title', required: true, example: 'AI Systems Workshop' },
      { key: 'eventOrganizer', label: 'Club / Organizer', required: false, example: 'IEEE Student Branch' },
      { key: 'eventDate', label: 'Event Date & Time', required: false, example: 'Sat, 28 Nov 2026, 2:00 PM IST' },
      { key: 'eventVenue', label: 'Venue', required: false, example: 'Seminar Hall 2' },
      { key: 'eventStatus', label: 'Approval Status', required: false, example: 'Approved' },
      { key: 'organiserNote', label: 'Reviewer Note', required: false, example: 'Added to featured campus events.' },
      { key: 'actionUrl', label: 'Events URL', required: false, example: 'https://campusconnectone.online/events.html' }
    ]
  },

  issue_created: {
    key: 'issue_created',
    label: 'New Campus Issue Reported',
    category: 'Campus Support',
    accent: '#d97706',
    accentSoft: '#fffbeb',
    badgeText: 'NEW ISSUE',
    defaultSubject: '[{{issueSeverity}}] New Campus Issue: {{issueTitle}}',
    defaultHeadline: 'New campus issue requires review',
    defaultGreeting: 'Hello {{recipientName}},',
    defaultIntro:
      'An anonymous campus issue has been logged in <strong>{{issueCategory}}</strong> at <strong>{{issueLocation}}</strong> and is queued for staff review.',
    defaultNoteLabel: 'Reported Description',
    defaultNoteKey: 'issueDescription',
    defaultCtaLabel: 'Review in Admin Console',
    defaultClosing:
      'Reporter identity remains strictly protected while status updates automatically notify the reporter.',
    details: [
      { label: 'Issue Title', value: '{{issueTitle}}' },
      { label: 'Category', value: '{{issueCategory}}' },
      { label: 'Severity', value: '{{issueSeverity}}' },
      { label: 'Location', value: '{{issueLocation}}' },
      { label: 'Current Status', value: '{{issueStatus}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Staff / Admin Name', required: true, example: 'Campus Operations Team' },
      { key: 'recipientEmail', label: 'Staff Email', required: true, example: 'admin@campusconnectone.online' },
      { key: 'issueTitle', label: 'Issue Title', required: true, example: 'Water cooler broken in Block C' },
      { key: 'issueCategory', label: 'Category', required: false, example: 'Infrastructure' },
      { key: 'issueSeverity', label: 'Severity', required: false, example: 'High' },
      { key: 'issueLocation', label: 'Location', required: false, example: 'Block C, 2nd Floor' },
      { key: 'issueStatus', label: 'Status', required: false, example: 'Open' },
      { key: 'issueDescription', label: 'Description', required: false, example: 'Leaking since morning and cooling unit stopped.' },
      { key: 'actionUrl', label: 'Admin Console URL', required: false, example: 'https://campusconnectone.online/admin.html' }
    ]
  },

  issue_update: {
    key: 'issue_update',
    label: 'Campus Issue Status Update',
    category: 'Campus Support',
    accent: '#0284c7',
    accentSoft: '#f0f9ff',
    badgeText: 'STATUS UPDATE',
    defaultSubject: 'Issue Update [{{issueStatus}}]: {{issueTitle}}',
    defaultHeadline: 'Your campus issue moved to {{issueStatus}}',
    defaultGreeting: 'Hi {{recipientName}},',
    defaultIntro:
      'An administrator has updated the campus issue <strong>{{issueTitle}}</strong>. Your public identity remains completely anonymous on the campus board.',
    defaultNoteLabel: 'Official Admin Response',
    defaultNoteKey: 'adminResponse',
    defaultCtaLabel: 'Track Issue Progress',
    defaultClosing:
      'You will continue receiving automatic email updates whenever the maintenance or admin team updates this ticket.',
    details: [
      { label: 'Issue', value: '{{issueTitle}}' },
      { label: 'Previous Status', value: '{{previousStatus}}' },
      { label: 'Current Status', value: '{{issueStatus}}' },
      { label: 'Category', value: '{{issueCategory}}' },
      { label: 'Location', value: '{{issueLocation}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Reporter Name (Private)', required: true, example: 'Student' },
      { key: 'recipientEmail', label: 'Reporter Email (Private)', required: true, example: 'student@campus.edu' },
      { key: 'issueTitle', label: 'Issue Title', required: true, example: 'Library Wi-Fi speed drops after 5 PM' },
      { key: 'previousStatus', label: 'Previous Status', required: false, example: 'Open' },
      { key: 'issueStatus', label: 'New Status', required: true, example: 'In Progress' },
      { key: 'issueCategory', label: 'Category', required: false, example: 'IT Services' },
      { key: 'issueLocation', label: 'Location', required: false, example: 'Central Library' },
      { key: 'adminResponse', label: 'Admin Official Response', required: false, example: 'IT team replaced the floor router and is monitoring load tonight.' },
      { key: 'actionUrl', label: 'Issues Board URL', required: false, example: 'https://campusconnectone.online/issues.html' }
    ]
  },

  issue_resolved: {
    key: 'issue_resolved',
    label: 'Campus Issue Resolved',
    category: 'Campus Support',
    accent: '#16a34a',
    accentSoft: '#f0fdf4',
    badgeText: 'RESOLVED',
    defaultSubject: 'Resolved: {{issueTitle}}',
    defaultHeadline: 'Campus issue marked as Resolved',
    defaultGreeting: 'Hi {{recipientName}},',
    defaultIntro:
      'Good news — the campus issue <strong>{{issueTitle}}</strong> has been marked <strong>Resolved</strong>. Thank you for helping improve campus facilities.',
    defaultNoteLabel: 'Resolution Summary',
    defaultNoteKey: 'adminResponse',
    defaultCtaLabel: 'View Issues Board',
    defaultClosing:
      'If the issue reoccurs at this location, feel free to submit a follow-up ticket anytime.',
    details: [
      { label: 'Issue', value: '{{issueTitle}}' },
      { label: 'Final Status', value: '{{issueStatus}}' },
      { label: 'Category', value: '{{issueCategory}}' },
      { label: 'Location', value: '{{issueLocation}}' },
      { label: 'Updated At', value: '{{updatedAt}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Reporter Name (Private)', required: true, example: 'Student' },
      { key: 'recipientEmail', label: 'Reporter Email (Private)', required: true, example: 'student@campus.edu' },
      { key: 'issueTitle', label: 'Issue Title', required: true, example: 'Water cooler broken in Block C' },
      { key: 'issueStatus', label: 'Status', required: false, example: 'Resolved' },
      { key: 'issueCategory', label: 'Category', required: false, example: 'Infrastructure' },
      { key: 'issueLocation', label: 'Location', required: false, example: 'Block C, 2nd Floor' },
      { key: 'adminResponse', label: 'Resolution Summary', required: false, example: 'Compressor replaced and unit sanitized.' },
      { key: 'updatedAt', label: 'Resolved Timestamp', required: false, example: 'Sun, 15 Nov 2026, 4:30 PM IST' },
      { key: 'actionUrl', label: 'Issues Board URL', required: false, example: 'https://campusconnectone.online/issues.html' }
    ]
  },

  community_join_request: {
    key: 'community_join_request',
    label: 'New Community Join Request',
    category: 'Communities',
    accent: '#7c3aed',
    accentSoft: '#f5f3ff',
    badgeText: 'JOIN REQUEST',
    defaultSubject: 'Join Request for {{communityName}}: {{requesterName}}',
    defaultHeadline: '{{requesterName}} wants to join {{communityName}}',
    defaultGreeting: 'Hi {{recipientName}},',
    defaultIntro:
      '<strong>{{requesterName}}</strong>{{requesterMeta}} has requested to join your community <strong>{{communityName}}</strong>. Review and approve or decline their request in one click.',
    defaultNoteLabel: 'Applicant Message / Details',
    defaultNoteKey: 'requestNote',
    defaultCtaLabel: 'Review Join Request',
    defaultClosing:
      'Approving this request will immediately grant {{requesterName}} member access and notify them by email.',
    details: [
      { label: 'Community', value: '{{communityName}}' },
      { label: 'Category', value: '{{communityCategory}}' },
      { label: 'Applicant', value: '{{requesterName}}' },
      { label: 'Request Status', value: '{{requestStatus}}' },
      { label: 'Submitted', value: '{{requestedAt}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Community Leader Name', required: true, example: 'Rohan Verma' },
      { key: 'recipientEmail', label: 'Leader Email', required: true, example: 'rohan@campus.edu' },
      { key: 'communityName', label: 'Community Name', required: true, example: 'Campus Coders' },
      { key: 'communityCategory', label: 'Community Category', required: false, example: 'Coding' },
      { key: 'requesterName', label: 'Requester Name', required: true, example: 'Ananya Gupta' },
      { key: 'requesterMeta', label: 'Requester Branch/Year', required: false, example: ' (CSE · 2nd Year)' },
      { key: 'requestStatus', label: 'Request Status', required: false, example: 'Pending Review' },
      { key: 'requestedAt', label: 'Submitted At', required: false, example: 'Sun, 15 Nov 2026, 6:15 PM IST' },
      { key: 'requestNote', label: 'Applicant Note', required: false, example: 'Interested in open-source projects and weekly DSA contests.' },
      { key: 'actionUrl', label: 'Community Requests URL', required: false, example: 'https://campusconnectone.online/admin.html' }
    ]
  },

  community_join_approved: {
    key: 'community_join_approved',
    label: 'Community Join Request Approved',
    category: 'Communities',
    accent: '#16a34a',
    accentSoft: '#f0fdf4',
    badgeText: 'WELCOME MEMBER',
    defaultSubject: 'Welcome to {{communityName}}! Membership Approved',
    defaultHeadline: "You're now a member of {{communityName}}",
    defaultGreeting: 'Hi {{recipientName}},',
    defaultIntro:
      'Congratulations! Your request to join <strong>{{communityName}}</strong> has been approved{{reviewedByPhrase}}. You now have full access to discussions, announcements, and community channels.',
    defaultNoteLabel: 'Welcome Note',
    defaultNoteKey: 'requestNote',
    defaultCtaLabel: 'Open Community Hub',
    defaultClosing:
      'Jump in, introduce yourself to fellow members, and check pinned announcements.',
    details: [
      { label: 'Community', value: '{{communityName}}' },
      { label: 'Category', value: '{{communityCategory}}' },
      { label: 'Status', value: '{{requestStatus}}' },
      { label: 'Approved By', value: '{{reviewerName}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Member Name', required: true, example: 'Ananya Gupta' },
      { key: 'recipientEmail', label: 'Member Email', required: true, example: 'ananya@campus.edu' },
      { key: 'communityName', label: 'Community Name', required: true, example: 'Campus Coders' },
      { key: 'communityCategory', label: 'Category', required: false, example: 'Coding' },
      { key: 'requestStatus', label: 'Membership Status', required: false, example: 'Approved' },
      { key: 'reviewerName', label: 'Reviewed By', required: false, example: 'Community Lead' },
      { key: 'reviewedByPhrase', label: 'Reviewer Phrase', required: false, example: ' by Community Lead' },
      { key: 'requestNote', label: 'Welcome Note', required: false, example: 'Welcome aboard! Weekly meetups happen every Thursday at 5 PM.' },
      { key: 'actionUrl', label: 'Community URL', required: false, example: 'https://campusconnectone.online/grouplist.html' }
    ]
  },

  community_join_rejected: {
    key: 'community_join_rejected',
    label: 'Community Join Request Update',
    category: 'Communities',
    accent: '#dc2626',
    accentSoft: '#fef2f2',
    badgeText: 'REQUEST UPDATE',
    defaultSubject: 'Membership Request Update: {{communityName}}',
    defaultHeadline: 'Update on your {{communityName}} request',
    defaultGreeting: 'Hi {{recipientName}},',
    defaultIntro:
      'Thank you for your interest in joining <strong>{{communityName}}</strong>. At this time, the community moderators were unable to approve your membership request.',
    defaultNoteLabel: 'Moderator Feedback',
    defaultNoteKey: 'rejectionReason',
    defaultCtaLabel: 'Explore Other Communities',
    defaultClosing:
      'There are dozens of active clubs and student groups across campus — explore communities aligned with your interests.',
    details: [
      { label: 'Community', value: '{{communityName}}' },
      { label: 'Category', value: '{{communityCategory}}' },
      { label: 'Decision', value: '{{requestStatus}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Applicant Name', required: true, example: 'Ananya Gupta' },
      { key: 'recipientEmail', label: 'Applicant Email', required: true, example: 'ananya@campus.edu' },
      { key: 'communityName', label: 'Community Name', required: true, example: 'Robotics Core Team' },
      { key: 'communityCategory', label: 'Category', required: false, example: 'Robotics' },
      { key: 'requestStatus', label: 'Decision', required: false, example: 'Not Approved' },
      { key: 'rejectionReason', label: 'Reason / Note', required: false, example: 'Cohort intake is currently full for this semester.' },
      { key: 'actionUrl', label: 'Communities Directory URL', required: false, example: 'https://campusconnectone.online/grouplist.html' }
    ]
  },

  hackathon_registration: {
    key: 'hackathon_registration',
    label: 'Hackathon Registration Confirmed',
    category: 'Hackathons',
    accent: '#178a54',
    accentSoft: '#f1f8f4',
    badgeText: 'HACKATHON PASS',
    defaultSubject: 'Registered: {{hackathonTitle}} — {{teamName}}',
    defaultHeadline: 'Your registration for {{hackathonTitle}} is confirmed',
    defaultGreeting: 'Hi {{recipientName}},',
    defaultIntro:
      'Your entry for <strong>{{hackathonTitle}}</strong> has been registered. Keep an eye on your participant portal for screening tests, round shortlists, and submission deadlines.',
    defaultNoteLabel: 'Host Instructions',
    defaultNoteKey: 'organiserNote',
    defaultCtaLabel: 'Open Participant Portal',
    defaultClosing:
      'Good luck building! Reach out to the organizing team if you need team roster updates.',
    details: [
      { label: 'Hackathon', value: '{{hackathonTitle}}' },
      { label: 'Team', value: '{{teamName}}' },
      { label: 'Schedule', value: '{{eventDate}}' },
      { label: 'Venue / Mode', value: '{{eventVenue}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Participant Name', required: true, example: 'Kabir Malhotra' },
      { key: 'recipientEmail', label: 'Participant Email', required: true, example: 'kabir@campus.edu' },
      { key: 'hackathonTitle', label: 'Hackathon Title', required: true, example: 'ABC — Any Buddy Can Code' },
      { key: 'teamName', label: 'Team Name', required: false, example: 'Team Quantum' },
      { key: 'eventDate', label: 'Hackathon Schedule', required: false, example: '20 Nov – 21 Nov 2026 IST' },
      { key: 'eventVenue', label: 'Venue / Mode', required: false, example: 'Campus Connect One Online' },
      { key: 'organiserNote', label: 'Host Instructions', required: false, example: 'Complete your team verification 24 hours before kickoff.' },
      { key: 'actionUrl', label: 'Portal URL', required: false, example: 'https://campusconnectone.online/hackthons-portal.html' }
    ]
  },

  moderation_report: {
    key: 'moderation_report',
    label: 'Moderation Report Notification',
    category: 'Trust & Safety',
    accent: '#b91c1c',
    accentSoft: '#fef2f2',
    badgeText: 'MODERATION',
    defaultSubject: 'Moderation {{reportStatus}}: {{reportType}} report',
    defaultHeadline: 'Moderation update: {{reportType}}',
    defaultGreeting: 'Hello {{recipientName}},',
    defaultIntro:
      'A content moderation report regarding <strong>{{reportType}}</strong> currently has status <strong>{{reportStatus}}</strong>.',
    defaultNoteLabel: 'Moderator Note',
    defaultNoteKey: 'moderatorNote',
    defaultCtaLabel: 'Open Moderation Queue',
    defaultClosing:
      'All moderation actions are recorded in the platform audit log for accountability.',
    details: [
      { label: 'Report Type', value: '{{reportType}}' },
      { label: 'Reason', value: '{{reportReason}}' },
      { label: 'Status', value: '{{reportStatus}}' },
      { label: 'Target ID', value: '{{targetId}}' }
    ],
    placeholders: [
      { key: 'recipientName', label: 'Recipient Name', required: true, example: 'Moderation Team' },
      { key: 'recipientEmail', label: 'Recipient Email', required: true, example: 'trust@campusconnectone.online' },
      { key: 'reportType', label: 'Target Type', required: true, example: 'Post' },
      { key: 'reportReason', label: 'Reason', required: false, example: 'Spam / Unverified Promotion' },
      { key: 'reportStatus', label: 'Status', required: false, example: 'Pending' },
      { key: 'targetId', label: 'Target Reference', required: false, example: 'post_4910' },
      { key: 'moderatorNote', label: 'Moderator Note', required: false, example: 'Flagged for manual content check.' },
      { key: 'actionUrl', label: 'Admin Console URL', required: false, example: 'https://campusconnectone.online/admin.html' }
    ]
  }
};

export const TYPE_ALIASES = {
  event_registration: 'event_registration',
  eventregistration: 'event_registration',
  event_interest: 'event_registration',
  eventinterest: 'event_registration',
  event_rsvp: 'event_registration',
  event_approved: 'event_approved',
  event_published: 'event_approved',
  issue_created: 'issue_created',
  issue_new: 'issue_created',
  new_issue: 'issue_created',
  issue_update: 'issue_update',
  issueupdate: 'issue_update',
  issue_status_update: 'issue_update',
  issue_updated: 'issue_update',
  issue_resolved: 'issue_resolved',
  issueresolved: 'issue_resolved',
  community_join_request: 'community_join_request',
  communityjoinrequest: 'community_join_request',
  group_join_request: 'community_join_request',
  group_request: 'community_join_request',
  group_request_created: 'community_join_request',
  community_join_approved: 'community_join_approved',
  group_request_approved: 'community_join_approved',
  join_approved: 'community_join_approved',
  community_join_rejected: 'community_join_rejected',
  group_request_rejected: 'community_join_rejected',
  join_rejected: 'community_join_rejected',
  hackathon_registration: 'hackathon_registration',
  hk_registration: 'hackathon_registration',
  moderation_report: 'moderation_report',
  report_created: 'moderation_report',
  report_reviewed: 'moderation_report'
};

export function detectEventType(input = {}, context = {}) {
  const payload = input && typeof input === 'object' ? input : {};
  const ctx = context && typeof context === 'object' ? context : {};

  const explicitRaw =
    payload.eventType ||
    payload.type ||
    payload.triggerType ||
    payload.event ||
    ctx.eventType ||
    '';

  const normalizedExplicit = String(explicitRaw)
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, '_');

  if (normalizedExplicit && TYPE_ALIASES[normalizedExplicit]) {
    const resolved = TYPE_ALIASES[normalizedExplicit];
    if (resolved === 'issue_update' && normalizeStatusKey(payload.status || payload.issueStatus) === 'resolved') {
      return {
        eventType: 'issue_resolved',
        confidence: 'high',
        reason: `Explicit type "${explicitRaw}" promoted to issue_resolved because status is Resolved`,
        definition: EVENT_TYPES.issue_resolved
      };
    }
    return {
      eventType: resolved,
      confidence: 'high',
      reason: `Matched explicit eventType "${explicitRaw}"`,
      definition: EVENT_TYPES[resolved]
    };
  }

  const col = String(payload.collection || ctx.collection || '').trim();
  const action = String(payload.action || ctx.action || '').trim().toLowerCase();
  const after = payload.after && typeof payload.after === 'object' ? payload.after : payload;
  const before = payload.before && typeof payload.before === 'object' ? payload.before : null;
  const effectiveStatus = normalizeStatusKey(
    after.status || after.issueStatus || after.requestStatus || after.decision || payload.decision
  );

  if (col === 'eventInterest') {
    return { eventType: 'event_registration', confidence: 'high', reason: 'Detected from collection eventInterest', definition: EVENT_TYPES.event_registration };
  }
  if (col === 'events' && effectiveStatus === 'approved') {
    return { eventType: 'event_approved', confidence: 'high', reason: 'Detected approved event in events collection', definition: EVENT_TYPES.event_approved };
  }
  if (col === 'issues') {
    if (effectiveStatus === 'resolved') {
      return { eventType: 'issue_resolved', confidence: 'high', reason: 'Detected Resolved status in issues collection', definition: EVENT_TYPES.issue_resolved };
    }
    if (action === 'update' || before || after.adminResponse || (effectiveStatus && effectiveStatus !== 'open')) {
      return { eventType: 'issue_update', confidence: 'high', reason: 'Detected issue update in issues collection', definition: EVENT_TYPES.issue_update };
    }
    return { eventType: 'issue_created', confidence: 'high', reason: 'Detected new issue in issues collection', definition: EVENT_TYPES.issue_created };
  }
  if (col === 'groupRequests' || col === 'communityRequests') {
    if (effectiveStatus === 'approved') {
      return { eventType: 'community_join_approved', confidence: 'high', reason: 'Detected approved status in groupRequests', definition: EVENT_TYPES.community_join_approved };
    }
    if (effectiveStatus === 'rejected' || effectiveStatus === 'declined') {
      return { eventType: 'community_join_rejected', confidence: 'high', reason: 'Detected rejected status in groupRequests', definition: EVENT_TYPES.community_join_rejected };
    }
    return { eventType: 'community_join_request', confidence: 'high', reason: 'Detected pending request in groupRequests', definition: EVENT_TYPES.community_join_request };
  }
  if (col === 'hkRegistrations') {
    return { eventType: 'hackathon_registration', confidence: 'high', reason: 'Detected from hkRegistrations collection', definition: EVENT_TYPES.hackathon_registration };
  }
  if (col === 'reports') {
    return { eventType: 'moderation_report', confidence: 'high', reason: 'Detected from reports collection', definition: EVENT_TYPES.moderation_report };
  }

  const keys = Object.keys(after);
  const hasAny = (...names) => names.some((n) => after[n] !== undefined && after[n] !== null && after[n] !== '');

  if (hasAny('hackathonId', 'hackathonTitle') || (hasAny('teamName') && hasAny('teamMode', 'leaderUid'))) {
    return { eventType: 'hackathon_registration', confidence: 'medium', reason: 'Inferred from hackathon payload fields', definition: EVENT_TYPES.hackathon_registration };
  }
  if (hasAny('groupId', 'groupName', 'communityId', 'communityName', 'requesterName', 'requestStatus', 'rejectionReason')) {
    if (effectiveStatus === 'approved') {
      return { eventType: 'community_join_approved', confidence: 'medium', reason: 'Inferred community approval from group fields + approved status', definition: EVENT_TYPES.community_join_approved };
    }
    if (effectiveStatus === 'rejected' || effectiveStatus === 'declined' || hasAny('rejectionReason')) {
      return { eventType: 'community_join_rejected', confidence: 'medium', reason: 'Inferred community rejection from group fields + rejected status', definition: EVENT_TYPES.community_join_rejected };
    }
    return { eventType: 'community_join_request', confidence: 'medium', reason: 'Inferred from community/group request fields', definition: EVENT_TYPES.community_join_request };
  }
  if (hasAny('issueId', 'issueTitle', 'adminResponse', 'previousStatus', 'severity', 'issueSeverity', 'issueCategory', 'supportCount')) {
    if (effectiveStatus === 'resolved') {
      return { eventType: 'issue_resolved', confidence: 'medium', reason: 'Inferred issue_resolved from issue fields + Resolved status', definition: EVENT_TYPES.issue_resolved };
    }
    if (hasAny('adminResponse', 'previousStatus') || (effectiveStatus && effectiveStatus !== 'open') || action === 'update') {
      return { eventType: 'issue_update', confidence: 'medium', reason: 'Inferred issue_update from issue status/response fields', definition: EVENT_TYPES.issue_update };
    }
    return { eventType: 'issue_created', confidence: 'medium', reason: 'Inferred issue_created from issue payload fields', definition: EVENT_TYPES.issue_created };
  }
  if (hasAny('eventId', 'eventTitle', 'venue', 'eventVenue', 'registrationId', 'eventDate')) {
    if (effectiveStatus === 'approved' && !hasAny('registrationId', 'attendeeUid', 'uid') && !keys.includes('eventId')) {
      return { eventType: 'event_approved', confidence: 'medium', reason: 'Inferred event_approved from event title + approved status', definition: EVENT_TYPES.event_approved };
    }
    return { eventType: 'event_registration', confidence: 'medium', reason: 'Inferred event_registration from eventId/eventTitle/venue fields', definition: EVENT_TYPES.event_registration };
  }
  if (hasAny('reportId', 'reportType', 'reportReason', 'moderatorNote', 'targetId')) {
    return { eventType: 'moderation_report', confidence: 'medium', reason: 'Inferred from moderation report fields', definition: EVENT_TYPES.moderation_report };
  }

  return { eventType: 'event_registration', confidence: 'low', reason: 'Defaulted to event_registration (no unique entity keys matched)', definition: EVENT_TYPES.event_registration };
}

export function extractPlaceholders(eventType, rawInput = {}) {
  const src = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const data = src.after && typeof src.after === 'object' ? { ...src, ...src.after } : src;
  const user = data.user || data.recipient || data.requester || {};
  const ev = data.event && typeof data.event === 'object' ? data.event : {};
  const iss = data.issue && typeof data.issue === 'object' ? data.issue : {};
  const grp = data.group || data.community || {};
  const before = src.before && typeof src.before === 'object' ? src.before : {};

  const recipientName =
    data.recipientName ||
    user.displayName ||
    user.name ||
    data.displayName ||
    data.name ||
    (eventType === 'issue_update' || eventType === 'issue_resolved' ? 'Campus Student' : 'There');

  const recipientEmail = data.recipientEmail || user.email || data.email || '';
  const branchParts = [user.course || data.course, user.branch || data.branch, user.year || data.year].filter(Boolean);
  const recipientBranch = data.recipientBranch || branchParts.join(' · ');

  const eventTitle = data.eventTitle || ev.title || data.title || 'Campus Event';
  const eventOrganizer = data.eventOrganizer || ev.organizer || data.organizer || 'Campus Organizing Team';
  const eventDate = data.eventDateStr || (data.eventDate || ev.date || data.date ? fmtDate(data.eventDate || ev.date || data.date) : 'To be announced');
  const eventVenue = data.eventVenue || ev.venue || data.venue || 'Main Campus';
  const registrationId = data.registrationId || data.id || (data.eventId && data.uid ? `${data.eventId.slice(0, 6)}-${data.uid.slice(0, 5)}`.toUpperCase() : 'CC-PASS');

  const issueTitle = data.issueTitle || iss.title || data.title || 'Campus Facility Issue';
  const issueStatus = data.issueStatus || iss.status || data.status || (eventType === 'issue_resolved' ? 'Resolved' : 'Open');
  const previousStatus = data.previousStatus || before.status || 'Open';
  const issueCategory = data.issueCategory || iss.category || data.category || 'General';
  const issueSeverity = data.issueSeverity || iss.severity || data.severity || 'Medium';
  const issueLocation = data.issueLocation || iss.location || data.location || 'Campus';
  const issueDescription = data.issueDescription || iss.description || data.description || '';
  const adminResponse = data.adminResponse || iss.adminResponse || data.response || '';
  const updatedAt = data.updatedAt ? fmtDate(data.updatedAt) : fmtDate(Date.now());

  const communityName = data.communityName || grp.name || data.groupName || 'Campus Community';
  const communityCategory = data.communityCategory || grp.category || data.category || 'Student Community';
  const requesterName = data.requesterName || data.displayName || user.displayName || 'A student';
  const requesterMeta = data.requesterMeta || (branchParts.length ? ` (${branchParts.join(' · ')})` : '');
  const requestStatusRaw =
    data.requestStatus ||
    data.decision ||
    data.status ||
    (eventType === 'community_join_approved' ? 'Approved' : eventType === 'community_join_rejected' ? 'Not Approved' : 'Pending Review');
  const requestStatus = String(requestStatusRaw).charAt(0).toUpperCase() + String(requestStatusRaw).slice(1);
  const reviewerName = data.reviewerName || 'Community Moderator';
  const reviewedByPhrase = reviewerName ? ` by ${reviewerName}` : '';
  const requestedAt = data.requestedAt || data.createdAt ? fmtDate(data.requestedAt || data.createdAt) : fmtDate(Date.now());

  const hackathonTitle = data.hackathonTitle || (data.hackathon && data.hackathon.title) || data.title || 'Campus Hackathon';
  const teamName = data.teamName || 'Individual Entry';

  const reportType = data.reportType || data.type || 'Content';
  const reportReason = data.reportReason || data.reason || 'Policy review requested';
  const reportStatus = data.reportStatus || data.status || 'Pending';
  const targetId = data.targetId || data.reportId || data.id || '—';
  const moderatorNote = data.moderatorNote || data.note || '';

  let defaultUrl = BASE_URL;
  if (eventType === 'event_registration' || eventType === 'event_approved') {
    defaultUrl = data.eventId ? `${BASE_URL}/events.html?event=${encodeURIComponent(data.eventId)}` : `${BASE_URL}/events.html`;
  } else if (eventType === 'issue_update' || eventType === 'issue_resolved') {
    defaultUrl = `${BASE_URL}/issues.html`;
  } else if (eventType === 'issue_created' || eventType === 'moderation_report') {
    defaultUrl = `${BASE_URL}/admin.html`;
  } else if (eventType === 'community_join_request') {
    defaultUrl = data.groupId ? `${BASE_URL}/group.html?id=${encodeURIComponent(data.groupId)}` : `${BASE_URL}/admin.html`;
  } else if (eventType === 'community_join_approved' || eventType === 'community_join_rejected') {
    defaultUrl = data.groupId ? `${BASE_URL}/group.html?id=${encodeURIComponent(data.groupId)}` : `${BASE_URL}/grouplist.html`;
  } else if (eventType === 'hackathon_registration') {
    defaultUrl = `${BASE_URL}/hackthons-portal.html`;
  }

  return {
    platformName: FROM_NAME,
    supportEmail: SUPPORT_EMAIL,
    year: String(new Date().getFullYear()),
    recipientName: String(recipientName),
    recipientEmail: String(recipientEmail),
    recipientBranch: String(recipientBranch),
    eventTitle: String(eventTitle),
    eventOrganizer: String(eventOrganizer),
    eventDate: String(eventDate),
    eventVenue: String(eventVenue),
    eventStatus: String(data.eventStatus || data.status || 'Approved'),
    registrationId: String(registrationId),
    organiserNote: String(data.organiserNote || data.note || ''),
    issueTitle: String(issueTitle),
    issueStatus: String(issueStatus),
    previousStatus: String(previousStatus),
    issueCategory: String(issueCategory),
    issueSeverity: String(issueSeverity),
    issueLocation: String(issueLocation),
    issueDescription: String(issueDescription),
    adminResponse: String(adminResponse),
    updatedAt: String(updatedAt),
    communityName: String(communityName),
    communityCategory: String(communityCategory),
    requesterName: String(requesterName),
    requesterMeta: String(requesterMeta),
    requestStatus: String(requestStatus),
    requestNote: String(data.requestNote || data.note || ''),
    reviewerName: String(reviewerName),
    reviewedByPhrase: String(reviewedByPhrase),
    requestedAt: String(requestedAt),
    rejectionReason: String(data.rejectionReason || data.reason || ''),
    hackathonTitle: String(hackathonTitle),
    teamName: String(teamName),
    reportType: String(reportType),
    reportReason: String(reportReason),
    reportStatus: String(reportStatus),
    targetId: String(targetId),
    moderatorNote: String(moderatorNote),
    actionUrl: safeUrl(data.actionUrl || data.url, defaultUrl)
  };
}

export function interpolatePlaceholders(template, vars = {}, options = {}) {
  const { keepPlaceholders = false, escapeHtml = false, allowEmpty = true } = options;
  const used = new Set();
  const missing = new Set();

  const rendered = String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    used.add(key);
    const val = vars[key];
    const hasVal = val !== undefined && val !== null && String(val) !== '';
    if (!hasVal) missing.add(key);
    if (keepPlaceholders) return `{{${key}}}`;
    const out = hasVal ? String(val) : (allowEmpty ? '' : `{{${key}}}`);
    return escapeHtml ? esc(out) : out;
  });

  return {
    text: rendered,
    placeholdersUsed: Array.from(used),
    missingPlaceholders: Array.from(missing)
  };
}

export function generateNotificationEmail(input = {}, options = {}) {
  const detection = options.eventType && EVENT_TYPES[options.eventType]
    ? {
        eventType: options.eventType,
        confidence: 'explicit',
        reason: 'Selected in template studio',
        definition: EVENT_TYPES[options.eventType]
      }
    : detectEventType(input, options.context || {});

  const def = detection.definition;
  const vars = {
    ...extractPlaceholders(detection.eventType, input),
    ...(options.placeholders || {})
  };

  const overrides = options.overrides || {};
  const keepPlaceholders = Boolean(options.keepPlaceholders);

  const subjectTpl = overrides.subject && overrides.subject.trim() ? overrides.subject.trim() : def.defaultSubject;
  const headlineTpl = overrides.headline && overrides.headline.trim() ? overrides.headline.trim() : def.defaultHeadline;
  const ctaTpl = overrides.ctaLabel && overrides.ctaLabel.trim() ? overrides.ctaLabel.trim() : def.defaultCtaLabel;
  const customNote = overrides.customNote !== undefined ? String(overrides.customNote) : '';

  const subjectRes = interpolatePlaceholders(subjectTpl, vars, { keepPlaceholders, escapeHtml: false });
  const headlineRes = interpolatePlaceholders(headlineTpl, vars, { keepPlaceholders, escapeHtml: true });
  const greetingRes = interpolatePlaceholders(def.defaultGreeting, vars, { keepPlaceholders, escapeHtml: true });
  const introRes = interpolatePlaceholders(def.defaultIntro, vars, { keepPlaceholders, escapeHtml: true });
  const closingRes = interpolatePlaceholders(def.defaultClosing, vars, { keepPlaceholders, escapeHtml: true });
  const ctaRes = interpolatePlaceholders(ctaTpl, vars, { keepPlaceholders, escapeHtml: true });
  const ctaUrl = keepPlaceholders ? '{{actionUrl}}' : esc(vars.actionUrl || BASE_URL);

  const noteVal = customNote.trim()
    ? customNote.trim()
    : (def.defaultNoteKey ? vars[def.defaultNoteKey] : '');

  const showNoteBox = keepPlaceholders || Boolean(noteVal && noteVal.trim());
  const noteContentHtml = keepPlaceholders
    ? `{{${def.defaultNoteKey || 'customNote'}}}`
    : nl2br(noteVal);

  const allUsed = new Set([
    ...subjectRes.placeholdersUsed,
    ...headlineRes.placeholdersUsed,
    ...greetingRes.placeholdersUsed,
    ...introRes.placeholdersUsed,
    ...closingRes.placeholdersUsed,
    ...ctaRes.placeholdersUsed
  ]);
  const allMissing = new Set([
    ...subjectRes.missingPlaceholders,
    ...headlineRes.missingPlaceholders,
    ...greetingRes.missingPlaceholders,
    ...introRes.missingPlaceholders
  ]);

  const rowsHtml = def.details
    .map((d) => {
      const valRes = interpolatePlaceholders(d.value, vars, { keepPlaceholders, escapeHtml: true });
      valRes.placeholdersUsed.forEach((k) => allUsed.add(k));
      valRes.missingPlaceholders.forEach((k) => allMissing.add(k));
      if (!keepPlaceholders && !valRes.text.trim()) return '';
      return `<tr>
        <td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;width:36%;vertical-align:top">${esc(d.label)}</td>
        <td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13.5px;color:#0f172a;font-weight:600;vertical-align:top">${valRes.text}</td>
      </tr>`;
    })
    .filter(Boolean)
    .join('');

  const noteHtml = showNoteBox
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;background:${def.accentSoft};border:1px solid #e2e8f0;border-radius:10px">
        <tr><td style="padding:14px 16px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${def.accent};margin-bottom:6px">${esc(def.defaultNoteLabel)}</div>
          <div style="font-size:14px;line-height:1.55;color:#1e293b">${noteContentHtml}</div>
        </td></tr>
      </table>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(subjectRes.text)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
          <tr>
            <td style="background-color:${def.accent};padding:24px 28px;color:#ffffff">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.9">${esc(vars.platformName)} · ${esc(def.category)}</td>
                  <td align="right" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.92">${esc(def.badgeText)}</td>
                </tr>
              </table>
              <h1 style="margin:10px 0 0;font-size:21px;line-height:1.3;font-weight:700;color:#ffffff">${headlineRes.text}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 24px">
              <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#0f172a">${greetingRes.text}</p>
              <p style="margin:0 0 20px;font-size:14.5px;line-height:1.65;color:#334155">${introRes.text}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:4px 16px">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${rowsHtml}
                    </table>
                  </td>
                </tr>
              </table>
              ${noteHtml}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 20px">
                <tr>
                  <td style="border-radius:9px;background-color:${def.accent}">
                    <a href="${ctaUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9px">${ctaRes.text}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13.5px;line-height:1.6;color:#64748b">${closingRes.text}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.55;color:#64748b">
              Sent automatically by <strong style="color:#334155">${esc(vars.platformName)}</strong> · <a href="${BASE_URL}" style="color:${def.accent};text-decoration:none">${BASE_URL.replace(/^https?:\/\//, '')}</a><br>
              Need help? Contact <a href="mailto:${esc(vars.supportEmail)}" style="color:#475569;text-decoration:none">${esc(vars.supportEmail)}</a> · © ${esc(vars.year)} ${esc(vars.platformName)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const plainIntro = interpolatePlaceholders(def.defaultIntro, vars, { keepPlaceholders, escapeHtml: false })
    .text.replace(/<[^>]+>/g, '');
  const plainHeadline = interpolatePlaceholders(headlineTpl, vars, { keepPlaceholders, escapeHtml: false }).text;
  const plainGreeting = interpolatePlaceholders(def.defaultGreeting, vars, { keepPlaceholders, escapeHtml: false }).text;
  const plainClosing = interpolatePlaceholders(def.defaultClosing, vars, { keepPlaceholders, escapeHtml: false }).text;
  const plainCta = interpolatePlaceholders(ctaTpl, vars, { keepPlaceholders, escapeHtml: false }).text;
  const plainDetails = def.details
    .map((d) => {
      const val = interpolatePlaceholders(d.value, vars, { keepPlaceholders, escapeHtml: false }).text;
      return val.trim() ? `- ${d.label}: ${val}` : '';
    })
    .filter(Boolean);

  const text = [
    `${vars.platformName} · ${def.category}`,
    plainHeadline,
    '',
    plainGreeting,
    plainIntro,
    '',
    ...plainDetails,
    showNoteBox ? `\n${def.defaultNoteLabel}:\n${keepPlaceholders ? `{{${def.defaultNoteKey || 'customNote'}}}` : noteVal}` : '',
    '',
    `${plainCta}: ${keepPlaceholders ? '{{actionUrl}}' : vars.actionUrl}`,
    '',
    plainClosing,
    `-- ${vars.platformName} (${vars.supportEmail})`
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n');

  return {
    eventType: detection.eventType,
    label: def.label,
    category: def.category,
    accent: def.accent,
    confidence: detection.confidence,
    detectedReason: detection.reason,
    subject: subjectRes.text,
    headline: plainHeadline,
    html,
    text,
    variables: vars,
    placeholderSchema: def.placeholders,
    placeholdersUsed: Array.from(allUsed),
    missingPlaceholders: Array.from(allMissing),
    keepPlaceholders
  };
}

export function buildSamplePayloads() {
  return {
    event_registration: {
      collection: 'eventInterest',
      action: 'create',
      eventId: 'evt_hacknight_2026',
      registrationId: 'EVT-94821',
      recipientName: 'Aarav Sharma',
      recipientEmail: 'aarav.sharma@campus.edu',
      eventTitle: 'Campus Hacknight 2026',
      eventOrganizer: 'Campus Coders Society',
      eventDate: '2026-11-20T10:00:00+05:30',
      eventVenue: 'Main Lab Block B',
      organiserNote: 'Check-in starts at 9:30 AM. Please bring your student ID card and laptop.'
    },
    issue_update: {
      collection: 'issues',
      action: 'update',
      issueId: 'iss_wifi_09',
      recipientName: 'Campus Student',
      recipientEmail: 'student.reporter@campus.edu',
      issueTitle: 'Library Wi-Fi drops frequently on 2nd floor',
      previousStatus: 'Open',
      status: 'In Progress',
      category: 'IT Services',
      location: 'Central Library, 2nd Floor',
      adminResponse: 'Network engineering replaced Access Point #4 and is monitoring evening peak load.'
    },
    issue_resolved: {
      collection: 'issues',
      action: 'update',
      issueId: 'iss_cooler_03',
      recipientName: 'Campus Student',
      recipientEmail: 'student.reporter@campus.edu',
      issueTitle: 'Water cooler broken in Block C',
      previousStatus: 'In Progress',
      status: 'Resolved',
      category: 'Infrastructure',
      location: 'Block C, 2nd Floor',
      adminResponse: 'Compressor replaced and drinking water unit sanitized and tested.'
    },
    community_join_request: {
      collection: 'groupRequests',
      action: 'create',
      groupId: 'grp_campus_coders',
      communityName: 'Campus Coders',
      communityCategory: 'Technology',
      recipientName: 'Rohan Verma',
      recipientEmail: 'rohan.lead@campus.edu',
      requesterName: 'Ananya Gupta',
      course: 'B.Tech',
      branch: 'CSE',
      year: '2nd Year',
      status: 'pending',
      requestNote: 'Passionate about full-stack engineering and preparing for inter-college hackathons.'
    },
    community_join_approved: {
      collection: 'groupRequests',
      action: 'update',
      groupId: 'grp_campus_coders',
      communityName: 'Campus Coders',
      communityCategory: 'Technology',
      recipientName: 'Ananya Gupta',
      recipientEmail: 'ananya.gupta@campus.edu',
      status: 'approved',
      reviewerName: 'Rohan Verma',
      requestNote: 'Welcome to Campus Coders! Join our Thursday 5 PM meetup in Lab 2.'
    },
    community_join_rejected: {
      collection: 'groupRequests',
      action: 'update',
      groupId: 'grp_robotics_core',
      communityName: 'Robotics Core Team',
      communityCategory: 'Robotics',
      recipientName: 'Ananya Gupta',
      recipientEmail: 'ananya.gupta@campus.edu',
      status: 'rejected',
      rejectionReason: 'This semester cohort reached capacity. Applications reopen in January.'
    },
    event_approved: {
      collection: 'events',
      action: 'update',
      eventId: 'evt_ai_workshop',
      recipientName: 'Priya Patel',
      recipientEmail: 'priya.patel@campus.edu',
      eventTitle: 'Generative AI Systems Workshop',
      organizer: 'IEEE Student Branch',
      date: '2026-11-28T14:00:00+05:30',
      venue: 'Seminar Hall 2',
      status: 'approved',
      organiserNote: 'Approved and featured on the Campus Events calendar.'
    },
    moderation_report: {
      collection: 'reports',
      action: 'create',
      reportId: 'rep_408',
      recipientName: 'Trust & Safety Team',
      recipientEmail: 'trust@campusconnectone.online',
      type: 'post',
      reason: 'Commercial spam promotion in Academic channel',
      status: 'pending',
      targetId: 'post_4910',
      moderatorNote: 'Flagged by 3 verified students for review.'
    }
  };
}

const LOCAL_LOGS_KEY = 'cc-auto-email-logs';

function pushLocalLog(entry) {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_LOGS_KEY) || '[]');
    existing.unshift({ id: `loc-${Date.now()}`, ...entry, createdAtMs: Date.now() });
    localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(existing.slice(0, 30)));
  } catch {}
}

export async function listAutoEmailLogs(max = 25) {
  let remote = [];
  if (db) {
    try {
      const snap = await getDocs(query(collection(db, 'emailNotificationLogs'), orderBy('createdAtMs', 'desc'), limit(max)));
      remote = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {}
  }
  let local = [];
  try {
    local = JSON.parse(localStorage.getItem(LOCAL_LOGS_KEY) || '[]');
  } catch {}
  const merged = [...remote, ...local].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return merged.slice(0, max);
}

/**
 * Attempts real Cloud Function dispatch (`previewOrSendAutoEmail`), and if functions/SMTP
 * are unavailable in local/preview mode, gracefully logs the rendered template to Firestore/localStorage
 * so callers never crash.
 */
export async function dispatchAutomatedEmailNotification({
  payload = {},
  context = {},
  placeholders = {},
  overrides = {},
  sendNow = true,
  source = 'admin_studio'
} = {}) {
  const generated = generateNotificationEmail(payload, {
    eventType: context.eventType || payload.eventType,
    context,
    placeholders,
    overrides
  });

  const to = String(placeholders.recipientEmail || payload.recipientEmail || generated.variables.recipientEmail || '').trim();

  // Attempt live Cloud Function SMTP delivery first when Firebase is active
  if (db) {
    try {
      const fn = httpsCallable(getFunctions(), 'previewOrSendAutoEmail');
      const res = await fn({
        payload,
        context,
        placeholders,
        overrides,
        sendNow,
        source
      });
      if (res && res.data) {
        return { mode: 'cloud_function', ...res.data };
      }
    } catch (fnErr) {
      // Fall through cleanly to audit log / preview queue when function is not deployed
      console.info('[auto-email] Cloud Function unavailable, recording template dispatch locally:', fnErr?.message || fnErr);
    }
  }

  const record = {
    eventType: generated.eventType,
    recipientEmail: to || '(not provided)',
    subject: generated.subject,
    status: sendNow ? (to ? 'queued_preview' : 'skipped_no_email') : 'preview',
    source,
    actorUid: auth?.currentUser?.uid || 'admin',
    createdAtMs: Date.now()
  };

  if (db) {
    try {
      await addDoc(collection(db, 'emailNotificationLogs'), {
        ...record,
        createdAt: serverTimestamp()
      });
    } catch {}
  }
  pushLocalLog(record);

  return {
    mode: 'template_fallback',
    ok: true,
    dispatched: false,
    recipientEmail: to,
    ...generated
  };
}

export function buildGmailComposeUrl({ to = '', subject = '', body = '' }) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1500))}`;
}
