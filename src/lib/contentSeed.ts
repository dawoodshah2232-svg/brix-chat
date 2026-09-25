// Brix Chat — phase-2 marketing content seed (100% original copy) + phase-2 API
// adapter for the §9 contract (implemented by Worker A in src/lib/api.ts).
//
// The adapter is a structural cast: method names/signatures follow §9 exactly.
// Once src/lib/api.ts implements them, the cast is transparent and these
// declarations can be deleted in favour of the real types.

import type { Envelope, Page, AuditEntry } from './api';

// ---------------------------------------------------------------------------
// Seed payloads
// ---------------------------------------------------------------------------

export interface BlogSeed {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  tags: string[];
  author: string;
  published: boolean;
  reading_mins: number;
  category_id?: string;
}

export interface HelpSeed {
  slug: string;
  title: string;
  body: string;
  category: string;
  order: number;
  category_id?: string | null;
}

export const BLOG_SEED: BlogSeed[] = [
  {
    slug: 'thirty-second-support-gap',
    title: 'Why visitors leave without asking: the 30-second support gap',
    excerpt:
      'Most confused visitors never reach out — they decide in seconds whether help looks available. Here is how to close the gap before they leave.',
    body: `## The short answer

Visitors who hit a moment of doubt usually give your site about thirty seconds before they leave. If no help looks available in that window — no visible chat, no clear answer nearby — they bounce and you never hear from them.

## What the gap looks like in practice

It is not the angry visitor who leaves. It is the quietly uncertain one: the shopper re-reading your shipping terms, the trial user hovering over the plan picker, the reader who cannot tell which integration they need. None of them will fill out a contact form. Some will open chat — if it is obviously there.

## Why forms lose this race

A contact form asks for a commitment (name, email, a well-written message) at the exact moment confidence is lowest. Live chat asks for almost nothing: one tap, one short question. That asymmetry is the whole game.

## How to measure your own gap

Pick your five highest-exit pages and watch sessions or session replays for hesitation signals: rapid scrolling back and forth, repeated visits to the same FAQ, long pauses on pricing. If you see hesitation without a chat opening, the gap is open.

## Closing it without being intrusive

- Keep the chat launcher visible on every page, including the ones where "nobody chats".
- Use a single proactive prompt on high-exit pages, timed 25–40 seconds in, worded as a question about the page ("Comparing plans? Happy to point you at the right one.").
- Put your fastest answer — pricing, delivery, compatibility — one click away inside the widget, not three pages deep.

## The takeaway

Support that only exists after a visitor commits to asking for it is support most visitors never get. Make help visible at the moment of doubt and the thirty-second gap starts closing on its own.`,
    tags: ['conversion', 'widget'],
    author: 'Layla Haddad',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'pre-chat-forms-that-convert',
    title: 'Pre-chat forms: the 3 fields that qualify and the 5 that kill conversion',
    excerpt:
      'A pre-chat form should qualify a visitor in ten seconds, not interrogate them. Three fields worth keeping — and five to drop today.',
    body: `## The short answer

Keep: name, what they need (a short topic or department picker), and optionally email for follow-up. Drop everything else until after the conversation starts.

## The three fields that qualify

**Name.** It makes the conversation human on both sides, and it is the cheapest field you will ever ask for.

**Topic or department.** One tap — Sales, Support, Billing — routes the chat correctly and sets the agent's context before the first message.

**Email (optional, for follow-up).** Useful when your team cannot always answer instantly. Mark it optional and collect it after the first reply if you can.

## The five that kill conversion

**Phone number.** On a first contact it reads as "prepare to be called". Conversion drops hard.

**Company + role + team size.** That is a sales qualification call disguised as a chat. Earn it later.

**Full message required, minimum 50 characters.** Visitors testing the waters write "hi". Let them.

**CAPTCHA.** You are filtering bots by punishing humans. Use rate limiting instead.

**"How did you hear about us?"** Ask this after you have helped them, never before.

## The rule of thumb

If a field does not change what the agent does in the first two minutes, it does not belong before the first message. Qualify during the chat, not at the door.`,
    tags: ['widget', 'forms'],
    author: 'Marco Reyes',
    published: true,
    reading_mins: 3,
  },
  {
    slug: 'canned-responses-that-dont-sound-canned',
    title: "Canned responses that don't sound canned",
    excerpt:
      'Templates save minutes per chat — but only if visitors cannot tell they are templates. The writing rules that keep canned replies human.',
    body: `## The short answer

Write every canned response as if you are answering one specific person, use the visitor's name and the details of their case, and leave one editable sentence in the middle.

## Why most templates feel robotic

They were written for the average case, and the average case does not exist. "Thank you for contacting support" addresses nobody. "Thanks for flagging this, Ayesha — I can see the invoice from Tuesday" addresses a person.

## The rewrite rules

**Start mid-conversation, not at a greeting.** Drop "Dear valued customer" energy. "Got it — looking at your order now" beats any salutation.

**Put variables to work.** Name, order number, plan, date — every detail you can insert automatically is one less thing that smells like a script.

**Leave a gap.** End templates with an open line the agent completes: "The fastest fix is ___, which I can do right now if you'd like." The agent fills the blank in their own words.

**One idea per template.** A template that answers three questions answers none of them well. Chain short ones instead.

**Review like code.** Once a month, read your ten most-used templates and delete or rewrite the ones that make you cringe. Usage counts tell you which ones those are.

## The test

Read it out loud. If you would never say it to someone standing in front of you, do not let your team send it to someone on the other side of a screen.`,
    tags: ['agents', 'productivity'],
    author: 'Tariq Aziz',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'chat-to-ticket-handoff',
    title: 'From chat to ticket: a clean handoff playbook',
    excerpt:
      'Chats end; problems do not always end with them. A handoff playbook that turns unresolved chats into tickets without losing context.',
    body: `## The short answer

Convert the chat to a ticket before the visitor leaves: carry over the transcript, the visitor's details, and a one-line summary of what is still open. Confirm the next step and when they will hear back.

## When a chat should become a ticket

- The fix needs another team or more than a day.
- The visitor is going offline before it is resolved.
- The chat started from an offline form or a missed chat — these are tickets wearing a chat costume.

## The five-line handoff

1. **Summarize in the agent's words.** "So the remaining issue is the refund for order 1042."
2. **State the next step.** "I am sending this to our billing team now."
3. **Give a time.** "You will hear back by tomorrow, 2pm your time." Vague promises create the next angry chat.
4. **Convert, don't copy-paste.** Use the convert action so the transcript, tags and contact travel with the ticket automatically.
5. **Confirm in the ticket.** The first ticket note should repeat the summary — whoever picks it up starts informed.

## What usually goes wrong

The agent says "I will look into it" and the chat closes into nothing. No ticket, no owner, no deadline. The visitor returns in three days, angrier, and explains everything again. Every unresolved chat needs an owner the moment it ends.

## Make it automatic where it counts

Missed chats and offline-form submissions should become tickets by themselves, assigned and timestamped, so nothing depends on an agent remembering to click convert at midnight.`,
    tags: ['tickets', 'workflow'],
    author: 'Nadia Karim',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'first-response-time-matters',
    title: 'CSAT is a lagging indicator — measure first response instead',
    excerpt:
      'CSAT tells you how last week felt. First response time tells you what is happening right now — and it is the metric your team can actually move.',
    body: `## The short answer

CSAT arrives after the damage is done. First response time is visible while the chat is still alive, correlates strongly with satisfaction, and improves the moment staffing or routing improves.

## Why CSAT lags

A CSAT survey lands after resolution. By the time the score drops you are investigating history, not fixing the present. It is also noisy: response rates are low, and only the delighted and the furious bother.

## What first response time gives you

**It is immediate.** A rising median first response at 2pm tells you the 2pm shift is understaffed — today, not in next month's report.

**It is actionable.** You can change routing, add an agent, or tighten a trigger and watch the number move within the hour.

**It predicts.** Teams with a fast first response rarely have CSAT problems. The reverse is not true — polite slow service still scores badly.

## How to use both

Keep CSAT as the health check and first response time as the steering wheel. Set a target both teams understand — "under 60 seconds in business hours" — and put it on the wall, not in a quarterly deck.

## The honest caveat

Speed without substance backfires. A 10-second "looking into it!" followed by silence is worse than a 90-second real answer. Measure first response alongside resolution quality, and never bonus on speed alone.`,
    tags: ['analytics', 'metrics'],
    author: 'Layla Haddad',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'proactive-chat-timing',
    title: 'Proactive chat without being creepy: timing rules that work',
    excerpt:
      'A prompt at the wrong second feels like surveillance. The same prompt at the right second feels like service. Timing rules that keep proactive chat welcome.',
    body: `## The short answer

Trigger proactive prompts on behavior that signals a question — 25+ seconds on pricing, repeated visits to a help page, cart value above a threshold — never on page load, and never more than once per visit.

## The creepy line

Visitors accept that websites react to what they do. They do not accept being greeted the instant the page renders — that says "we were waiting for you" before they have done anything worth noticing.

## Timing rules that work

- **Wait for a signal, not a timer alone.** Time-on-page plus scroll depth, or a return visit to the same page, beats a bare 30-second delay.
- **Match the message to the page.** Pricing page: "Comparing plans? I can point you at the right one." Checkout: "Anything holding up the order — happy to help."
- **Once per visit, dismissible, remembered.** A dismissed prompt stays dismissed. A prompt that follows the visitor across pages is a pop-up with extra steps.
- **New vs returning matters.** First-time visitors need orientation; returning visitors need continuity ("Welcome back — still deciding on the Pro plan?").

## What to measure

Track prompt-to-chat rate and chat-to-goal rate per trigger. A trigger with high opens but no conversations is noise — rewrite or retire it. One good trigger beats ten mediocre ones.`,
    tags: ['campaigns', 'triggers'],
    author: 'Marco Reyes',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'unanswered-questions-log',
    title: 'The unanswered-questions log: turning misses into help articles',
    excerpt:
      'Every question your bot or team cannot answer is a free content brief. Run a weekly loop: collect the misses, draft the articles, watch the misses shrink.',
    body: `## The short answer

Keep a log of questions that got no good answer. Once a week, take the top repeats and turn them into help articles or canned responses. The log is the cheapest content strategy a support team has.

## Why misses are valuable

Answered questions teach you nothing new — the knowledge already exists. Unanswered questions point exactly at the gap between what visitors need and what your docs cover. That is a prioritized writing backlog, generated by your visitors, for free.

## The weekly loop

1. **Collect.** Every "I don't know" from the bot and every agent escalation lands in one list, with counts.
2. **Cluster.** Group near-duplicates: three phrasings of "how do I change my invoice email" are one article, not three.
3. **Draft.** Write the article or canned reply that would have answered it. Keep it short and answer-first.
4. **Close the loop.** Mark the log entries resolved by the new article, and watch next week's counts.

## What good looks like

A healthy team resolves most repeats within a week and the log trends toward genuinely new, interesting questions. A log that only grows is not a content problem — it is a sign nobody owns the loop.

## Start before you have AI

You do not need a bot for this. A shared list and a 30-minute weekly review does the job. The bot just makes the collection automatic later.`,
    tags: ['knowledge base', 'ai'],
    author: 'Tariq Aziz',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'local-first-support-software',
    title: 'Local-first support software: what stays in your browser and why',
    excerpt:
      'Brix Chat runs its full demo in your browser with no server. Here is exactly what is stored where — and what changes when a backend arrives.',
    body: `## The short answer

In local mode, everything — chats, contacts, tickets, settings, keys — lives in your browser's localStorage under one key. Nothing leaves your machine. A backend phase later moves storage server-side without changing how the product works.

## What stays in your browser

- **All workspace data:** properties, conversations, messages, contacts, tickets, articles, canned replies, campaigns, triggers.
- **Team and access:** member records, roles, passcodes, session state.
- **Integrations and keys:** API keys and third-party credentials you enter, stored locally and shown obfuscated.
- **Configuration:** widget settings, business hours, copilot preferences, security and data-retention settings.

## Why build it this way

You can evaluate the entire platform — widget, dashboard, admin, automations — with zero signup friction and zero data leaving your machine. For regulated or cautious teams, that is the difference between "let's try it" and a three-month security review.

## What is honestly limited in local mode

Real-time sync across devices, real push notifications, actual email sending, real AI calls, and real webhook HTTP delivery all need a server. The product is explicit about each of these: anything with a "backend phase" badge is configured locally today and activates when the server ships.

## What changes at backend phase

The storage layer moves to an API; method names, the admin UI and your data model stay the same. Export your local data first (Admin → Data → Export), and the migration is a restore, not a rebuild.`,
    tags: ['privacy', 'security'],
    author: 'Nadia Karim',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'ecommerce-chat-playbooks',
    title: 'Chat on ecommerce: where to trigger, what to say, and when to stay quiet',
    excerpt:
      'Ecommerce chat pays for itself on product, cart, and checkout pages — and annoys everywhere else. Page-specific plays, honest timing, and the discipline to stay silent.',
    body: `## The short answer

Chat earns its keep on ecommerce in exactly three places: the product page, the cart, and checkout. Everywhere else it should stay quiet. One well-timed, page-specific question beats a site-wide popup every time.

## Where doubt is expensive

Not all pages are equal. A confused visitor on your About page costs you nothing; a confused visitor on checkout costs you the order. Aim chat at the pages where hesitation has a price:

- **Product pages.** Sizing, compatibility, "will this work with what I already own" — the questions that decide a purchase, asked at the moment of decision.
- **Cart page.** Shipping-cost surprises, delivery dates, discount codes that "should" work. This is where carts quietly die.
- **Checkout.** Payment errors and last-minute trust doubts. A chat launcher here is a safety net, not a sales pitch.
- **Post-purchase.** "Where is my order?" is the most common ecommerce question in existence. Answer it inside the widget with an order lookup and it never reaches an agent.

## What to say — and what never to say

Good proactive messages name the page they are on. "Comparing the two models? I can point you at the right one." Bad ones could appear on any site on the internet: "Hi! Need help with anything?" The first earns a reply because it proves a human is paying attention; the second earns a click on the close button.

Write every trigger message as a question about the page, in plain language, under fifteen words. If you cannot tell which page it belongs to, rewrite it.

## When to stay quiet

Restraint is the whole skill. A few rules that never backfire:

- Do not trigger on a first-time visitor's first five seconds. Let them look around.
- Do not pop anything while someone is typing in a checkout field. Interrupting a payment is unforgivable.
- Do not message twice if the first message was ignored. Silence is an answer.
- Be honest about hours. "We are away right now — leave a message and we reply in the morning" builds more trust than a bot pretending to be an agent.

## Four plays worth setting up

1. **The cart nudge.** After 45–60 idle seconds on the cart page: "Quick question — is it the shipping cost or the delivery date holding things up?" Most cart doubts are one of those two.
2. **The exit save.** Exit-intent on the cart page only, one message, one question about what is unresolved. Never a discount thrown blindly — you are training visitors to threaten to leave.
3. **The fit check.** Right after add-to-cart on technical products: "Want me to double-check this fits your setup?" Compatibility anxiety is real and cheap to resolve.
4. **The date reassurance.** Before holidays and sale events, a checkout-page note: "Order in the next few hours and it arrives before the holiday." Only say this if your logistics actually support it.

## Product pages: the three questions that decide purchases

On product pages, visitors are almost always stuck on one of three things. Write your trigger and your canned answers around them:

- **"Will it fit / work with what I have?"** Compatibility and sizing questions. The best answer includes a link to the size guide or compatibility chart, not just a yes.
- **"Which one should I get?"** Comparison anxiety between your own products. A short "if you need X, take A; if you need Y, take B" resolves more purchases than any feature list.
- **"Is it actually in stock / when will it arrive?"** Availability and delivery questions asked at the moment of commitment. Answer with specifics, never "soon."

## The cart-page autopsy

When a cart sits idle, it is usually one of four problems. Train your triggers and your team on all four:

1. **Shipping shock.** The total jumped at the last step. A message naming it directly — "Shipping added more than expected? Here is what it covers, and here is the free-shipping threshold" — works better than pretending it did not happen.
2. **Delivery doubt.** "Will it arrive by Friday?" Answer with the real cutoff, and say so plainly when the answer is no. A lost sale today beats a chargeback next week.
3. **Code hunting.** They are in another tab searching for a discount code. A cart message offering any current promotion ends the hunt and the distraction.
4. **Second thoughts.** They are not sure they need it. This one you cannot and should not push — a simple "Anything I can clarify about the product?" respects the decision.

## Checkout: be a safety net, not a distraction

Checkout is the one page where proactive chat should almost never trigger on its own. Someone entering card details does not want a popup. Keep the launcher visible and quiet, make sure an agent or a good offline message is behind it, and let the visitor come to you. The exception is a payment error: if the page can detect a failed attempt, a gentle "Payment didn't go through — want a hand?" is genuinely helpful.

## A note on mobile

More than half your cart traffic is on phones, where a chat popup covers the whole screen. On mobile, prefer a small persistent chat button over any proactive bubble, and keep trigger messages to one short line. If your trigger looks fine on desktop but covers the checkout button on a phone, it is costing you orders.

## How to know a play works

Track three things per trigger: how often it fires, what share of visitors reply, and how many of those conversations end near a completed order. A play that fires a thousand times and gets ten replies is not "brand awareness" — it is noise. Turn it off and try a different message or a different page.

## The takeaway

Ecommerce chat is a scalpel, not a billboard. Put it where doubt costs money, write messages that prove you can see the page, and have the discipline to stay silent everywhere else.`,
    tags: ['conversion', 'triggers', 'campaigns'],
    author: 'Marco Reyes',
    published: true,
    reading_mins: 6,
  },
  {
    slug: 'ai-assist-humans-in-charge',
    title: 'AI drafts, humans send: a practical AI-assist setup for small teams',
    excerpt:
      'AI is at its best drafting replies, fixing tone, and summarizing threads — with a human pressing send. The guardrails that keep assist helpful instead of risky.',
    body: `## The short answer

Let AI draft, rephrase, and summarize. Let humans decide and send. That one boundary — AI never sends a message on its own — removes almost every risk people fear about AI in support.

## Where AI actually helps a small team

Forget the fully autonomous agent for now. The unglamorous assist features are where the value is:

- **Drafting replies.** The agent writes two rough sentences; AI turns them into a clear, complete answer. The thinking stays human, the writing gets polished.
- **Tone repair.** Tired agents write terse replies at 11pm. AI softens them without changing the meaning.
- **Summaries.** Long threads, handoffs between shifts, ticket escalations — a three-line summary saves the next person five minutes of scrolling.
- **Suggested answers from your docs.** AI grounded in your own knowledge base surfaces the right article while the agent chats, instead of the agent searching for it.

## The guardrails that matter

**AI never sends.** This is the rule everything else hangs on. Suggestions appear in the agent's composer; the agent reviews, edits, and sends. On billing, refunds, and account changes, some teams go further and require a second human glance.

**Show the source.** When AI pulls from your knowledge base, show which article it used. An agent who can see the source can spot when the AI is guessing. An agent who cannot is flying blind.

**Keep a human review loop for the first month.** Skim a sample of AI-assisted conversations weekly. You are looking for two things: places the AI was wrong, and places agents stopped thinking and just clicked send. Both are fixable; neither is visible without the review.

**Tell visitors when it is AI.** "Our assistant drafted this reply — an agent reviewed it" is honest and costs you nothing. Visitors can tell anyway; being upfront is what keeps the trust.

## What to ground it in

AI without your knowledge base is just confident guessing. Point it at your help articles, your canned responses, and your past resolved chats. The quality of AI assist tracks the quality of your docs almost one to one — which is a good reason to maintain both.

## When to turn it off

AI assist is wrong for some conversations: angry customers who need a human to take responsibility, brand-new issue types with no documentation yet, and anything legally sensitive. Give agents a visible off switch and permission to use it. Assist that cannot be declined becomes a crutch.

## Prompt discipline: the three sentences every assist prompt needs

AI assist is only as good as its instructions. Every drafting or suggestion prompt in your setup should contain three things:

1. **Who it is.** "You are a support assistant for [company], writing in a friendly, plain-spoken tone." Without this, the AI borrows a tone from nowhere.
2. **What it may use.** "Answer only from these help articles and past resolved chats. If the answer is not there, say so." This single sentence prevents most hallucinations.
3. **What it must never do.** "Never invent prices, dates, or policy details. Never promise refunds, timelines, or outcomes." The never-list is more important than the can-list.

Review these prompts the way you would review a new hire's scripts — because that is what they are.

## Common failure modes (and the fixes)

- **Hallucinated policy.** The AI invents a return window or a price. Fix: tighten the grounding rule above, and keep your docs current — stale docs produce confident wrong answers.
- **Over-politeness.** "I sincerely apologize for any inconvenience this may have caused you" for a two-minute delay. Fix: tell the prompt to match the customer's register and keep apologies proportional.
- **Tone drift across agents.** One agent accepts every draft verbatim, another rewrites everything. Fix: the weekly review should look at edit distance — drafts that always ship untouched mean agents stopped thinking.
- **The confident wrong answer.** The most dangerous kind: fluent, specific, and false. Fix: source display plus the human-send rule. Fluency is not accuracy.

## What changes for the customer

Done right, customers notice almost nothing — replies are just clearer and faster. Done wrong, they notice everything: robotic phrasing, answers that dodge the question, apologies that sound generated. The weekly review is how you stay on the right side of that line. If assisted replies start scoring worse on follow-up questions ("but what about…"), the AI is papering over gaps in your docs. Fix the docs.

## The cost question

AI assist costs inference on every draft, which is real money at scale. The math that justifies it: measure handle time per conversation before and after, and the share of chats resolved without escalation. If drafting saves each agent even a few minutes per chat, it pays for itself quickly on a busy team. If your volume is tiny, the free-form discipline in this article still applies when you grow into it.

## Start small

Turn on one feature — reply drafting is the usual first — for one team, for two weeks. Review the sample, adjust the prompts and the docs, then expand. Teams that roll out everything at once end up trusting none of it.

## The takeaway

AI in support works best as a very fast junior colleague: quick with drafts, honest about sources, and never allowed to send the email itself. Set that boundary and the rest is just good tooling.`,
    tags: ['ai', 'agents', 'workflow'],
    author: 'Tariq Aziz',
    published: true,
    reading_mins: 6,
  },
  {
    slug: 'onboard-support-agent',
    title: 'Your first support hire: the onboarding checklist that gets them answering in a week',
    excerpt:
      'A new support agent can handle real chats well within a week — if the first five days are structured. The day-by-day plan, the tools to hand over, and what to review at day 30.',
    body: `## The short answer

Day one is shadowing and product. Days two and three are the canned library and tone. Day four is supervised chats. Day five is solo with review. Structure the week and a new hire is genuinely useful by Friday.

## Before day one

Have three things ready before they start, or the first week dissolves into setup:

- **Access to everything:** the chat dashboard, the knowledge base, the order system — with a practice or sandbox mode if you have one.
- **The reading list:** your ten most common questions and their best answers, your tone guide, and your escalation policy. Not the whole wiki; the ten that matter.
- **A buddy:** one experienced agent who answers "is this normal?" questions for the first two weeks. This matters more than any document.

## The five-day plan

**Day 1 — Watch and learn.** They shadow the buddy's chats, read resolved conversations, and click through the product as a customer would. No pressure to perform; the goal is context. End the day by asking them to explain the product back to you in their own words.

**Day 2 — The library.** Walk through your canned responses and help articles together. For each of the top ten questions: what the customer is really asking, what a good answer contains, and what never to promise. Have them rewrite two canned replies in their own voice.

**Day 3 — Tone and edge cases.** Practice the hard ones: the angry customer, the refund outside policy, the question nobody knows. Role-play three scenarios out loud. Awkward now beats disastrous later.

**Day 4 — Supervised chats.** They take real chats with the buddy watching and able to jump in. Keep the queue light — three to five conversations, not fifteen. Review each one together afterward: what went well, one thing to change.

**Day 5 — Solo, with a safety net.** They work the queue alone, but every conversation gets a quick review at end of day. By now they should be resolving the common cases independently and escalating the rest cleanly.

## What "good" looks like at day 30

Do not judge a new hire on speed in the first month. Judge them on three things: do customers understand their answers, do they escalate with full context instead of dumping, and do they ask for help early rather than guessing. Speed comes naturally once those are solid.

## The tools to hand over on day one

- The canned response library, with permission to edit and improve it.
- The escalation list: who takes what, and how to hand over with context.
- The tone guide: two pages maximum. If it is longer, nobody will read it.
- Permission to say "I don't know, let me find out" — and the habit of actually following up.

## Week two: widening the net

Week one builds the foundation; week two builds range. Have them take on the less common cases with the buddy on call rather than watching, start answering in the channels you have not covered yet (email, social, tickets), and write their first help article — the question they got asked twice that was not documented. Writing the article forces them to learn the answer properly, and your knowledge base grows.

## The quality rubric to review against

Vague feedback like "be more helpful" teaches nothing. Review their chats against a short, concrete rubric:

- **Accuracy.** Was the answer correct and complete? One wrong answer undoes ten friendly ones.
- **Clarity.** Could a non-technical customer follow it? Short sentences, no jargon, one idea per message.
- **Ownership.** Did they take responsibility ("I'll sort this out") or deflect ("That's another team's issue")?
- **Handoff quality.** When they escalated, did the next person get full context, or start from zero?
- **Follow-through.** Did they actually come back with the answer they promised?

Score a handful of chats weekly for the first month. Share the scores with them — the point is coaching, not surveillance.

## Making the buddy system actually work

"Ask me anything" is not a buddy system. Make it concrete: the buddy reviews the new hire's first twenty chats, is the default escalation target for two weeks, and has explicit permission to interrupt a live chat when something is going wrong. Pick buddies for patience and clarity, not just tenure — your fastest agent is not always your best teacher. Rotate the buddy after a month so the new hire sees more than one style.

## When a new hire is struggling

Most struggles trace back to one of three causes, and each has a fix:

- **Product knowledge gaps.** They guess instead of checking. Fix: pair them with docs for a day and quiz them on the top twenty questions until the answers are reflex.
- **Fear of the queue.** They freeze on live chats. Fix: more supervised sessions, not fewer — confidence comes from reps with a safety net.
- **Tone problems.** Too stiff, too casual, too defensive. Fix: show them three of their own chats next to three great ones and let them spot the difference themselves. People internalize what they discover.

If all three are fine and performance still lags after a month, the role may genuinely not fit — and it is kinder to everyone to say so early.

## The 30-60-90 check-ins

Keep the structure going after the first week. At 30 days: review the rubric scores together and set one skill to improve. At 60: they should be mentoring the *next* new hire's shadowing day — teaching is the fastest way to cement knowledge. At 90: a proper review against the same standards as everyone else. Onboarding does not end when the training wheels come off; it ends when they are indistinguishable from the team.

## The mistake to avoid

Throwing a new hire onto the full queue on day two "to learn by doing." They learn, all right — they learn bad habits, panic responses, and that asking for help is discouraged. A structured week costs you five days. An unstructured start costs you months of retraining.

## The takeaway

Support skill is mostly product knowledge plus judgment, and both transfer faster than founders expect — when the transfer is deliberate. Five structured days, a buddy, and a day-30 review turn a new hire into a real contributor before the month is out.`,
    tags: ['agents', 'productivity', 'workflow'],
    author: 'Layla Haddad',
    published: true,
    reading_mins: 6,
  },
  {
    slug: 'after-hours-chat-offline',
    title: 'What your chat widget should say when nobody is online',
    excerpt:
      'Most websites only think about chat during office hours — but visitors arrive around the clock. Handle the offline hours honestly: clear hours, a message that sets a real reply window, and a leave-a-message form people actually complete.',
    body: `## The short answer

Your chat widget is most dishonest at 2 a.m. — when it still looks ready to help and nobody is behind it. Visitors do not mind that you are asleep; they mind finding out by typing into a void. An honest offline state tells them three things: that nobody is online right now, when a human will be back, and what to do instead. Get those three right and after-hours chat becomes a lead-capture channel instead of a disappointment machine.

## Stop pretending somebody is there

The worst offline experience is a chat window that behaves exactly like the online one — typing indicator, "we usually reply in minutes" — until the visitor realizes the conversation went nowhere. That is not a small UX wart; it teaches people that your widget lies. The fix is embarrassingly simple: when agents are offline, change the widget's greeting to say so, plainly: "We are offline right now." No euphemisms like "all agents are currently assisting other customers" when the truth is that it is midnight. Visitors can tell, and the ones who cannot will feel tricked when nobody replies.

If you run a bot after hours, say it is a bot: "Our assistant can answer common questions — a person replies in the morning." Honesty costs nothing and buys you the trust that makes the morning reply welcome instead of suspicious.

## Say when you are back — specifically

"We will get back to you soon" is the offline equivalent of elevator music: technically a response, emotionally nothing. Soon could mean ten minutes or ten days, and the visitor knows it. Replace it with a specific window you can actually keep:

- If you start the day at a fixed time: "We are back online at 9:00 AM — leave a message and we will reply first thing."
- If hours vary by day: show today's hours and tomorrow's opening time.
- If replies come by email rather than chat: say that, and say when. "We reply to every message within one business day" is a promise; "we will be in touch" is a shrug.

The rule is simple: never promise a reply window in the widget that your team does not actually meet. One broken promise teaches the visitor to never trust the widget again.

## The leave-a-message form that gets replies

Offline chat usually ends in a message form, and most message forms are interrogations: name, email, phone, company, subject, priority, message, captcha. Every field you add past the essential three costs you completions. Keep three and only three:

1. **What is this about?** (the message itself — the one field that matters)
2. **Where should we reply?** (one contact field, email or phone — their choice, not yours)
3. **Their name** (so the reply can be personal)

Then close the loop the way you promised: the reply should reference what they wrote, come from a named person, and arrive inside the window you stated. Nothing destroys trust faster than an offline message that vanishes into silence. Make the morning catch-up a named job — "check last night's messages" belongs to one specific person, not to whoever remembers.

## Weekend and holiday mode

Teams remember to set office hours and forget the exceptions, so the widget keeps promising "back at 9 AM" on a public holiday. Two habits fix this: a holiday calendar your widget reads for its offline message, and a fallback line for the days you forgot — "We are currently closed; we reply to messages within one business day." The fallback should be the honest default, not a special case. Visitors are forgiving of a closed shop; they are not forgiving of a shop that claims to be open and is not.

## Let the bot hold the night shift

A simple after-hours bot that answers the five questions people actually ask at night — opening hours, delivery times, pricing basics, how to book, where the thing they bought is — can resolve a meaningful share of overnight conversations on its own. The bar is not a brilliant conversationalist; it is a helpful FAQ with a search box. Ground it in your own help articles so it cannot invent answers, and always offer the escape: "Want a person? Leave a message and we will reply in the morning." A bot that admits its limits is more useful than an agent-shaped lie.

## Measure the offline experience

Two numbers tell you whether your after-hours setup works: the reply rate on offline messages (what share got a real answer inside the promised window) and the message-to-first-reply time each morning. If the reply rate is low, the form is too long or the catch-up has no owner. If replies are late, the promised window is fiction — change the promise, not the clock. Review both monthly; they drift as teams and hours change.

## The ten-minute after-hours checklist

1. Set real office hours in the widget, including weekends.
2. Write the offline greeting in plain language: offline, back-when, what-to-do.
3. Reduce the message form to three fields.
4. Add a holiday fallback line.
5. Name one person who owns the morning catch-up.
6. If you run a night bot, label it as automated.

## The takeaway

Offline hours are not dead time — they are the hours when your widget makes promises on your behalf. Make the promises honest, specific, and kept, and the 2 a.m. visitor becomes a morning conversation instead of a lost one.`,
    tags: ['widget', 'workflow', 'conversion'],
    author: 'Nadia Karim',
    published: true,
    reading_mins: 5,
  },
  {
    slug: 'chat-reports-worth-reading',
    title: 'Five chat reports worth reading every week',
    excerpt:
      'Most teams glance at chat volume and call it analytics. These five reports — missed chats, response time by hour, resolution without escalation, question topics, and agent load — are the ones that actually change what you do next.',
    body: `## The short answer

Your chat tool collects a mountain of data, and almost all of it is decoration. Five reports earn their keep: missed chats, first response time by hour, resolution without escalation, what visitors actually ask about, and how load is distributed across agents. Read them weekly, change one thing after each, and your support operation will look different in a quarter.

## 1. Missed chats — the ones that got away

A missed chat is a conversation that started and never got a human reply: the visitor typed, nobody answered, and they left. Every one of these is a person who did the hard part — reaching out — and was met with silence. Count them per week, and more importantly, note *when* they happened. Missed chats cluster: lunch breaks, shift changes, the hour after closing. The fix is usually scheduling, not staffing — move a break, stagger a shift, turn on an honest offline message for the uncovered hour. A missed chat you can see is a scheduling problem; a missed chat you never count is a churn problem.

## 2. First response time, by hour of day

Average response time is a vanity number: it hides the 4 p.m. disaster inside a respectable daily average. Break first response time into hourly buckets and the pattern jumps out — the hours where visitors wait are almost always the hours where staffing dips or a single agent is drowning. Set a target that matches your promise (if the widget says "we reply in minutes," minutes is the target, not hours), and treat every hour that misses it as a staffing decision to make. This report pairs naturally with missed chats: long response times in an hour usually precede the misses.

## 3. Resolution without escalation

Not every chat should need a human expert — the healthy question is what share of conversations get resolved by the first responder, the bot, or a help article, versus how many get escalated or turned into tickets. If escalation is climbing, do not blame the agents first; look at what is being escalated. A rising escalation rate usually means one of three things: the bot's answers are stale, a product change created a new question nobody documented, or the first line lacks the authority to do the obvious thing (refunds, plan changes, account fixes). Fix the cause and the rate falls. Track this monthly — it moves slowly, and that is fine.

## 4. What visitors actually ask about

Tag your conversations — even roughly — and the top topics will surprise you. Most teams discover that a handful of questions dominate: the same five topics, week after week. Each recurring topic is a to-do item in disguise: a confusing page to rewrite, a help article to write, a bot answer to add, a product rough edge to sand down. This is the report that pays for itself fastest, because every topic you eliminate is support work that never happens again. Review the top ten topics monthly and pick one to kill at the source.

## 5. Agent load — who is drowning and who is idle

Totals per agent, per week: conversations handled, average handle time, and chats handled simultaneously. You are looking for imbalance, not leaderboard winners. One agent quietly carrying twice the load of everyone else is a burnout risk and a quality risk — tired agents write worse replies. Persistent imbalance usually means routing is wrong (round-robin across unequal skill sets), or one person is the unofficial expert everyone escalates to. Rebalance the routing, document what the expert knows, and the load evens out. This report is also the fairest input to staffing decisions: hire when the whole team is loaded, not when one hero is.

## What to ignore

Total chat volume, on its own, tells you almost nothing — it moves with traffic, campaigns, and seasonality, and it never suggests an action. The same goes for average handle time in isolation: fast can mean efficient or rushed, slow can mean thorough or stuck. Any number that never changes a decision is decoration. If a report has not caused a single change in three months, stop reading it and give the slot to one of the five above.

## The twenty-minute weekly routine

1. **Missed chats** — count them, note the hours, fix the coverage.
2. **Response time by hour** — find the slow hours, adjust staffing.
3. **Topics** — pick the top repeat and kill it at the source.
4. **Escalation** — check the trend, update one bot answer or help article.
5. **Load** — spot the imbalance, rebalance.

## The takeaway

Analytics that do not change a decision are just numbers with good design. These five reports each end in an action — a schedule change, a rewritten page, a new help article, a routing fix. If a report never changes what you do, stop reading it and read one of these instead.`,
    tags: ['analytics', 'metrics', 'workflow'],
    author: 'Marco Reyes',
    published: true,
    reading_mins: 6,
  },
  {
    slug: 'welcome-message-copy-that-converts',
    title: 'Write a welcome message visitors actually answer',
    excerpt:
      "Nobody replies to ‘How can I help you?’ — it asks for effort without offering value. Welcome messages that earn replies are specific, short, and tied to the page: one question, under twenty words, about what the visitor is doing right now.",
    body: `## The short answer

The default chat greeting — "Hi! How can I help you?" — fails because it puts all the work on the visitor: they have to figure out what to ask, how to phrase it, and whether you can even help. Flip it. A greeting that names something specific about the page, asks one short question, and stays under twenty words will always outperform the generic hello. Copy is not the whole game — timing matters as much — but bad copy wastes good timing every time.

## The specificity test

Read your greeting out loud and ask: could this appear on any website on the internet? If yes, it says nothing. "Hi there! Need any help?" could be a shoe store, a bank, or a plumber. Compare: "Comparing the two plans? I can walk you through the difference." That sentence can only exist on a pricing page, which is exactly why it works — it proves someone is paying attention to *this* page, *right now*. Specificity is respect: it tells the visitor you noticed what they are doing instead of interrupting it.

## One question, under twenty words

Two rules that never backfire:

- **Ask exactly one question.** Two questions split the visitor's attention and both go unanswered. Pick the single most likely doubt on the page.
- **Stay under twenty words.** A greeting is an invitation, not a paragraph. If it needs a second sentence, it needs an edit.

Good bones to steal: "Still deciding between the plans? Happy to compare them with you." (13 words, one question, page-specific.) "Is it the shipping cost or the delivery date holding up the order?" (14 words, names the two real doubts.) Notice what none of these do: no exclamation marks, no "Hi there!", no asking the visitor to do your job.

## Borrow the page's context

The best greetings are written per page, not per site. A pricing page gets a plan question; a product page gets a fit question; a checkout page gets a reassurance question; a help article gets "Did this answer your question?" Write three or four greetings for your highest-traffic pages and leave the generic one for everywhere else. This is also where triggers earn their keep: a greeting that appears 30 seconds into a pricing-page visit is a different message from the one in the launcher bubble — the first can assume interest, the second has to earn it.

## Personalize lightly, never creepily

Using the visitor's name (if they gave it) or referencing the page they are on feels attentive. Referencing their location, device, or browsing history feels like surveillance. The line is simple: personalize with what the visitor *chose to share* or what is *obviously public* on the current page. "Welcome back" to a returning customer is warm; "I see you were looking at the enterprise plan for 4 minutes" is a horror movie. When in doubt, leave the data out of the sentence.

## Timing beats copy

Even perfect copy fails at the wrong moment. Do not greet a visitor in their first five seconds — they have not looked at anything yet and your message is noise. Do not greet someone mid-checkout-typing — interrupting a payment is unforgivable. Do not send a second greeting when the first was ignored; silence is an answer. The reliable pattern: one greeting, timed 25–40 seconds into a high-intent page, worded as a question about that page. Everything else is the launcher bubble doing its quiet job.

## Bad, better, best

- **Bad:** "Hello! Welcome to our website! How may I assist you today?" (Could be anyone. Asks the visitor to do the work. Three pleasantries, zero information.)
- **Better:** "Questions about pricing? I am here to help." (Page-specific, but still puts the work on the visitor — *they* have to formulate the question.)
- **Best:** "Choosing between monthly and annual? The annual plan pays for itself in month seven." (Names the actual decision, offers a concrete fact, invites a reply without demanding one.)

## Measure replies, not views

A greeting's only metric is the reply rate: what share of visitors who saw it typed something back. Views are vanity; replies are conversations. Test one greeting at a time against the current one for a week or two, keep the winner, and write the next challenger. Most teams find their first rewrite beats the default by a wide margin — which tells you how low the default bar is, not how good the rewrite is. Keep iterating anyway.

## The takeaway

Visitors do not owe your widget a conversation. Earn the first message the way you would in person: notice what they are doing, ask one useful question about it, and keep it short. Specificity, brevity, timing — in that order.`,
    tags: ['widget', 'triggers', 'conversion'],
    author: 'Layla Haddad',
    published: true,
    reading_mins: 5,
  },
];

export const HELP_SEED: HelpSeed[] = [
  {
    slug: 'create-workspace',
    title: 'Create your workspace',
    body: `## What a workspace is

A workspace holds everything for one business: websites, chats, team members, settings. Most teams need exactly one.

## Steps

1. Open the signup page and choose a workspace name — usually your company name, lowercase, no spaces.
2. Pick a display name for yourself and set a passcode of at least 4 characters. You are the workspace admin.
3. You land in the agent dashboard. Head to the Admin console (top-left menu, or /admin) to add your website next.

## Good to know

- Workspace names cannot be changed later in local mode, so pick carefully.
- Your passcode is stored in this browser only. If you forget it on a fresh browser, create a new workspace and re-add your site — your data stays in the old browser.`,
    category: 'Getting started',
    order: 1,
  },
  {
    slug: 'install-widget',
    title: 'Install the widget on your website',
    body: `## Steps

1. In the Admin console, open the Properties tab and add your website (name + domain).
2. Click Snippet next to the property and copy the embed code.
3. Paste it just before the closing </body> tag on every page where you want chat.
4. Open your site in a new tab — the chat launcher should appear bottom-right within a few seconds.

## Verify it works

Open Admin → Install, pick your property, and compare the snippet on your page with the one shown. The data-property value must match your property's public key exactly.

## Optional overrides

Add data-color, data-position, data-greeting or data-locale attributes to the script tag to override dashboard defaults for one page without changing the property settings.`,
    category: 'Getting started',
    order: 2,
  },
  {
    slug: 'invite-team',
    title: 'Invite your team',
    body: `## Steps

1. Open Admin → Team and enter the member's display name.
2. Choose a role: admin (everything), agent (chats only), developer (keys and webhooks, no chat content), viewer (read-only).
3. Click Invite member — a one-time passcode appears. Share it with the person directly (message, call, password manager).
4. They log in with the workspace name + their passcode and pick their own display name.

## Roles, briefly

- **Admin** — full access including billing-adjacent settings, keys, webhooks, team.
- **Agent** — answers chats, uses canned replies, no admin screens.
- **Developer** — manages API keys and webhooks. Cannot read chat content.
- **Viewer** — can look at everything, change nothing.

## Good to know

Email invites arrive with the backend phase. In local mode, the passcode is the invite — treat it like a temporary password and rotate it if it leaks.`,
    category: 'Getting started',
    order: 3,
  },
  {
    slug: 'first-chat',
    title: 'Handle your first chat',
    body: `## Steps

1. With the widget installed, open your website in an incognito window and send a message through the widget.
2. In the dashboard, the conversation appears in the inbox under Open. Click it.
3. Reply from the composer at the bottom. The visitor sees your message in real time.
4. When done, mark the conversation resolved (or leave it open if you expect a follow-up).

## Tips for the first week

- Set your status (online / away / offline) from the agent menu so visitors see honest availability.
- Try a canned response: type / in the composer to see shortcuts.
- After a few chats, check Analytics for your first response time — aim under a minute in business hours.`,
    category: 'Getting started',
    order: 4,
  },
  {
    slug: 'pre-chat-form',
    title: 'Set up a pre-chat form',
    body: `## Steps

1. Open Admin → Properties and select your website.
2. Under Chat forms, toggle the pre-chat form on.
3. Choose the fields: name, email and topic are the recommended starting set.
4. Save. New widget sessions on that property now ask for these before the chat starts.

## Field guidance

Keep it to three fields or fewer. Name plus topic routes the chat correctly; email lets you follow up if the visitor goes offline. Phone numbers and company details belong later in the conversation, not at the door.

## Offline form

The offline form appears when no agent is online (or outside business hours) and creates a ticket automatically. Toggle it in the same section and pick which fields it asks for.`,
    category: 'How-to',
    order: 5,
  },
  {
    slug: 'triggers',
    title: 'Build a trigger (proactive message)',
    body: `## Steps

1. Open the dashboard → Triggers and click New trigger.
2. Pick the event: page view, time on page, scroll depth, exit intent, or cart value.
3. Add conditions (AND/OR): page URL contains /pricing, visitor is new, tag equals vip.
4. Choose actions: send a message, assign to a department, add a tag, set priority, or start a campaign.
5. Enable it, then use Test run to preview what a visitor would see.

## Writing the message

Match the page and the signal. "Comparing plans? I can point you at the right one." works on /pricing after 25 seconds. "Welcome!" on page load does not — it fires before the visitor has done anything worth noticing.

## Keep it polite

One proactive message per visit, dismissible, and remembered across pages. Retire triggers with high dismiss rates.`,
    category: 'How-to',
    order: 6,
  },
  {
    slug: 'campaigns',
    title: 'Send a campaign',
    body: `## Steps

1. Open the dashboard → Campaigns and click New campaign.
2. Write the message (short — two lines max) and optionally attach an image.
3. Set the audience: page URL contains, new vs returning visitors, tags.
4. Schedule it for later or send now. Drafts stay drafts until you publish.
5. Pick a goal event to track (e.g. signup, purchase) so the campaign reports attributed conversions.

## Good practice

Campaigns are announcements and nudges, not newsletters. One clear call to action, an honest audience, and a goal attached. Check delivery and goal completions in the campaign report afterwards.`,
    category: 'How-to',
    order: 7,
  },
  {
    slug: 'tickets',
    title: 'Work with tickets',
    body: `## Steps

1. Open the dashboard → Tickets to see new, open and resolved tickets.
2. Click a ticket to read the requester, message and linked transcript (if it came from a chat).
3. Assign it to an agent or department, set priority, and reply.
4. Resolve it when done. Resolved tickets stay searchable.

## Where tickets come from

Offline forms, missed chats (auto-converted), and manual creation from any conversation via the Convert to ticket action. SLA due times highlight overdue tickets automatically.

## Bulk actions

Select multiple tickets to resolve, assign or mark as spam in one go. Useful after a busy weekend or a spam wave.`,
    category: 'How-to',
    order: 8,
  },
  {
    slug: 'webhooks',
    title: 'Connect a webhook',
    body: `## Steps

1. Open Admin → Developers and click Add endpoint.
2. Enter your HTTPS URL and tick the events you want (start with message.created and ticket.created).
3. Copy the secret shown once — you need it to verify the X-Brix-Signature header.
4. Click Test fire to see the exact signed payload your endpoint will receive.

## Verifying payloads

Every delivery carries X-Brix-Signature: hex HMAC-SHA256 of "<timestamp>.<raw_body>" keyed with your secret. Reject anything older than five minutes or with a bad signature. Full code samples are in docs/WEBHOOKS.md.

## Local mode note

Configuration and signed test payloads work fully in this browser, but no real HTTP requests leave the browser until the backend phase. The event catalog, headers and signature format are already final.`,
    category: 'How-to',
    order: 9,
  },
  {
    slug: 'api-keys',
    title: 'Create an API key',
    body: `## Steps

1. Open Admin → Developers and enter a key name (e.g. "store backend").
2. Tick only the scopes the integration needs — least privilege keeps a leaked key harmless.
3. Click Create key and copy the full key immediately. It is shown once; lists show only the prefix.
4. Store it in your server's environment variables, never in frontend code.

## Managing keys

Rotate a key any time the old value stops working instantly. Revoke instead of deleting when you want the record kept for the audit log. Usage counts and last-used timestamps show on every key.

## Scopes

Available scopes: properties, conversations, contacts, tickets, kb, webhooks (read/write pairs) and metrics:read.`,
    category: 'How-to',
    order: 10,
  },
  {
    slug: 'canned-variables',
    title: 'Use variables in canned responses',
    body: `## Steps

1. Open the dashboard → Canned and create or edit a response.
2. Insert variables where personalization helps: visitor name, agent name, date, property name.
3. In a chat, type / plus the shortcut code to insert the response, then edit the middle before sending.

## Why variables matter

A template with the visitor's name and order number reads as a personal reply; the same text without them reads as a script. Variables are the cheapest personalization you have.

## Personal vs shared

Keep personal drafts for your own phrasing experiments; promote the ones that work to shared so the whole team benefits. Usage counts show which templates earn their keep.`,
    category: 'How-to',
    order: 11,
  },
  {
    slug: 'keyboard-shortcuts',
    title: 'Keyboard shortcuts',
    body: `## Inbox navigation

- **j / k** — move to the next / previous conversation
- **r** — jump to the reply composer
- **/ ** — focus search (or insert a canned response inside the composer)
- **?** — open the shortcuts help modal
- **Esc** — close dialogs and panels

## Tips

Shortcuts work when the inbox list or a conversation is focused, not while typing in a field (except / inside the composer for canned replies). Press ? any time to see the full list.`,
    category: 'How-to',
    order: 12,
  },
];

// ---------------------------------------------------------------------------
// Seeding helpers (idempotent — only seed when the store is empty)
// ---------------------------------------------------------------------------

export async function seedBlogIfEmpty(p2: Phase2Api): Promise<number> {
  // Backfill: seed only the slugs missing from the store, so new articles
  // added to BLOG_SEED reach visitors whose store was seeded earlier too.
  const { data } = await p2.blog.list(true);
  const existing = new Set(data.items.map((i) => i.slug));
  let n = 0;
  for (const b of BLOG_SEED) {
    if (!existing.has(b.slug)) {
      await p2.blog.create(b);
      n++;
    }
  }
  return n;
}

export async function seedHelpIfEmpty(p2: Phase2Api): Promise<number> {
  const { data } = await p2.helpDocs.list();
  if (data.items.length > 0) return 0;
  for (const a of HELP_SEED) {
    await p2.helpDocs.create(a);
  }
  return HELP_SEED.length;
}

// ---------------------------------------------------------------------------
// Phase-2 API adapter — exact §9 contract surface.
// ---------------------------------------------------------------------------

export type TicketPriority2 = 'low' | 'medium' | 'high' | 'urgent';
export interface ApiTicket2 {
  id: string; property_id: string; subject: string; message: string;
  requester_name: string; requester_email: string; status: string; priority: TicketPriority2;
  assignee_id: string | null; sla_due: number | null; conversation_id: string | null;
  tags: string[]; created_at: number; updated_at: number;
}
export interface ApiBlogPost2 {
  id: string; slug: string; title: string; excerpt: string; body: string; tags: string[];
  author: string; published: boolean; reading_mins: number; created_at: number; updated_at: number;
}
export interface ApiHelpArticle2 {
  id: string; slug: string; title: string; body: string; category: string; order: number; updated_at: number;
  published?: boolean;
  /** KB category id (api.categories, scope 'kb'); null = uncategorized. */
  category_id?: string | null;
}
export interface ApiContactMessage2 {
  id: string; name: string; email: string; subject: string; message: string; read: boolean; created_at: number;
}
export interface ApiStatusEntry2 {
  id: string; title: string; detail: string; state: 'operational' | 'degraded' | 'incident'; created_at: number;
}
export interface ApiMember2 {
  id: string; display_name: string; initials: string; color: string; role: string;
  passcode: string; last_login: number | null; status: 'online' | 'away' | 'offline'; created_at: number;
  // Extended profile fields (forward-compatible; persist once the members contract lands them).
  job_title?: string; avatar_data_url?: string | null; department_ids?: string[];
}
// ---------------------------------------------------------------------------
// Departments + routing (api.departments.*, api.routing.routeChat)
// ---------------------------------------------------------------------------
export type RoutingMode = 'round-robin' | 'least-busy' | 'first-available';
export type OfflineBehavior = 'ticket' | 'message' | 'hide';
export interface DayHours { day: number; open: string; close: string; closed: boolean; }
export interface ApiDepartment2 {
  id: string; property_id: string;
  name: string; description: string;
  agent_ids: string[];
  routing_mode: RoutingMode;
  hours_override: Array<{ day: number; open: string; close: string }> | null; // null = inherit property hours; empty open/close = closed
  offline_behavior: OfflineBehavior;
  created_at: number;
}
export interface DepartmentInput2 {
  name: string; description?: string; agent_ids?: string[];
  routing_mode?: RoutingMode;
  hours_override?: Array<{ day: number; open: string; close: string }> | null;
  offline_behavior?: OfflineBehavior;
}
// ---------------------------------------------------------------------------
// Categories (api.categories.*): KB, canned-response, and ticket categories.
// ---------------------------------------------------------------------------
export type CategoryKind = 'kb' | 'canned' | 'tickets';
export interface ApiCategory2 {
  id: string; scope: CategoryKind; property_id: string;
  name: string; color: string; created_at: number;
}
export interface CategoryInput2 { name: string; color?: string; }
// ---------------------------------------------------------------------------
// Ratings (api.ratings.*): two records per survey — kind 'csat' (1-5) and
// kind 'nps' (0-10). Low = csat ≤ 2, nps ≤ 6.
// ---------------------------------------------------------------------------
export interface ApiRating2 {
  id: string; property_id: string; conversation_id: string | null;
  agent_id: string | null; kind: 'csat' | 'nps' | 'ces'; score: number;
  comment: string; created_at: number;
}
export interface RatingInput2 {
  property_id: string; conversation_id?: string | null; agent_id?: string | null;
  kind: 'csat' | 'nps' | 'ces'; score: number; comment?: string;
}
export interface RatingsSummary2 {
  csat_avg: number | null; csat_count: number;
  nps_score: number | null; nps_count: number;
  promoters: number; passives: number; detractors: number;
  trend: Array<{ day: string; csat_avg: number | null; nps_avg: number | null; count: number }>;
}
export interface ApiUnanswered2 {
  id: string; question: string; conversation_id: string | null; count: number; dismissed: boolean; created_at: number;
}
export interface ApiIntegration2 {
  id: string; name: string; description: string; fields: Array<{ name: string; label: string; secret: boolean }>;
  values: Record<string, string>; enabled: boolean; phase: 'local' | 'backend';
}
export interface PropertySettings2 {
  greeting_online: string; greeting_away: string; greeting_offline: string;
  offline_form_enabled: boolean; offline_form_fields: string[];
  prechat_enabled: boolean; prechat_fields: string[];
  departments: Array<{ id: string; name: string }>;
  business_hours: Array<{ day: number; open: string; close: string }>;
  timezone: string; blocked: string[];
  widget_color: string; widget_position: 'bottom-right' | 'bottom-left';
  launcher_style: 'bubble' | 'bar'; language: string; booking_url: string;
  // Branding (white-label) — stored via propertySettings.patch; honored by /kb/:propertyKey.
  // custom_domain / custom_subdomain / default_department_id are not in the
  // runtime PropertySettings interface yet; patch() merges schemalessly so
  // they persist, and the adapter carries them here.
  logo_data_url: string | null; brand_name: string; tagline: string;
  accent_color: string; custom_domain: string; custom_subdomain: string;
  // Widget color scheme: 'light' | 'dark' | 'auto' — honored by the widget (phase 3, Worker D).
  theme: string;
  // Routing: default department for "when chat starts → route to department X".
  default_department_id: string;
}
export interface CopilotSettings2 {
  tone: 'friendly' | 'professional' | 'concise'; autosuggest: boolean; summarize: boolean;
  translate: boolean; sources: string[]; provider: 'local' | 'openai' | 'anthropic';
}
export interface SecuritySettings2 {
  session_timeout_mins: number; passcode_min_len: number; passcode_expiry_days: number;
}
export interface DataSettings2 { retention_days: number; auto_purge: boolean; }
export interface ApiPlay2 {
  id: string; name: string;
  steps: Array<{ kind: 'reply' | 'tag' | 'assign' | 'priority' | 'note'; value: string }>;
  created_at: number;
}
export interface ApiGoal2 { id: string; name: string; event: string; revenue: number; created_at: number; }
export interface GoalFunnel2 {
  visitors: number; chats: number;
  goals: Array<{ goal: string; count: number; revenue: number }>;
}
export interface AuditSearchOpts { actor?: string; action?: string; from?: string; to?: string; cursor?: string; limit?: number; }

export interface Phase2Api {
  blog: {
    list(publishedOnly?: boolean): Promise<Envelope<Page<ApiBlogPost2>>>;
    getBySlug(slug: string): Promise<Envelope<ApiBlogPost2>>;
    create(input: BlogSeed): Promise<Envelope<ApiBlogPost2>>;
    update(id: string, patch: Partial<BlogSeed>): Promise<Envelope<ApiBlogPost2>>;
    delete(id: string): Promise<Envelope<void>>;
  };
  helpDocs: {
    list(): Promise<Envelope<Page<ApiHelpArticle2>>>;
    getBySlug(slug: string): Promise<Envelope<ApiHelpArticle2>>;
    create(input: HelpSeed): Promise<Envelope<ApiHelpArticle2>>;
    update(id: string, patch: Partial<HelpSeed>): Promise<Envelope<ApiHelpArticle2>>;
    delete(id: string): Promise<Envelope<void>>;
  };
  contactMessages: {
    create(input: { name: string; email: string; subject: string; message: string }): Promise<Envelope<ApiContactMessage2>>;
    list(): Promise<Envelope<Page<ApiContactMessage2>>>;
    markRead(id: string): Promise<Envelope<ApiContactMessage2>>;
  };
  statusEntries: {
    list(): Promise<Envelope<Page<ApiStatusEntry2>>>;
    create(input: { title: string; detail: string; state: ApiStatusEntry2['state'] }): Promise<Envelope<ApiStatusEntry2>>;
    delete(id: string): Promise<Envelope<void>>;
  };
  members: {
    list(): Promise<Envelope<Page<ApiMember2>>>;
    create(displayName: string, role: string, passcode: string): Promise<Envelope<ApiMember2>>;
    update(id: string, patch: Partial<ApiMember2>): Promise<Envelope<ApiMember2>>;
    remove(id: string): Promise<Envelope<void>>;
    setPasscode(id: string, passcode: string): Promise<Envelope<ApiMember2>>;
    setStatus(id: string, status: ApiMember2['status']): Promise<Envelope<ApiMember2>>;
  };
  propertySettings: {
    get(propertyId: string): Promise<Envelope<PropertySettings2>>;
    patch(propertyId: string, patch: Partial<PropertySettings2>): Promise<Envelope<PropertySettings2>>;
  };
  copilotSettings: {
    get(): Promise<Envelope<CopilotSettings2>>;
    patch(patch: Partial<CopilotSettings2>): Promise<Envelope<CopilotSettings2>>;
  };
  securitySettings: {
    get(): Promise<Envelope<SecuritySettings2>>;
    patch(patch: Partial<SecuritySettings2>): Promise<Envelope<SecuritySettings2>>;
  };
  dataSettings: {
    get(): Promise<Envelope<DataSettings2>>;
    patch(patch: Partial<DataSettings2>): Promise<Envelope<DataSettings2>>;
  };
  integrations: {
    list(): Promise<Envelope<ApiIntegration2[]>>;
    patch(id: string, patch: Partial<ApiIntegration2>): Promise<Envelope<ApiIntegration2>>;
  };
  unanswered: {
    list(): Promise<Envelope<Page<ApiUnanswered2>>>;
    dismiss(id: string): Promise<Envelope<ApiUnanswered2>>;
    promote(id: string): Promise<Envelope<{ id: string; title: string }>>;
  };
  ratings: {
    create(input: RatingInput2): Promise<Envelope<ApiRating2>>;
    list(opts?: { property_id?: string; agent_id?: string; kind?: 'csat' | 'nps'; from?: number; to?: number; limit?: number }): Promise<Envelope<Page<ApiRating2>>>;
    summary(propertyId: string, days?: number): Promise<Envelope<RatingsSummary2>>;
  };
  routing: {
    routeChat(propertyId: string, departmentId?: string | null): Promise<Envelope<{ agent_id: string | null; department_id: string | null }>>;
  };
  departments: {
    list(propertyId: string): Promise<Envelope<ApiDepartment2[]>>;
    create(propertyId: string, input: DepartmentInput2): Promise<Envelope<ApiDepartment2>>;
    update(id: string, patch: Partial<DepartmentInput2>): Promise<Envelope<ApiDepartment2>>;
    delete(id: string): Promise<Envelope<{ deleted: true }>>;
  };
  categories: {
    list(scope: CategoryKind, propertyId?: string): Promise<Envelope<ApiCategory2[]>>;
    create(scope: CategoryKind, propertyId: string, name: string, color?: string): Promise<Envelope<ApiCategory2>>;
    update(id: string, patch: Partial<CategoryInput2>): Promise<Envelope<ApiCategory2>>;
    delete(id: string): Promise<Envelope<{ deleted: true }>>;
  };
  plays: {
    list(): Promise<Envelope<Page<ApiPlay2>>>;
    create(name: string, steps: ApiPlay2['steps']): Promise<Envelope<ApiPlay2>>;
    delete(id: string): Promise<Envelope<void>>;
  };
  goals: {
    list(): Promise<Envelope<Page<ApiGoal2>>>;
    create(name: string, event: string, revenue: number): Promise<Envelope<ApiGoal2>>;
    delete(id: string): Promise<Envelope<void>>;
    funnel(days: number): Promise<Envelope<GoalFunnel2>>;
  };
  audit: {
    search(opts?: AuditSearchOpts): Promise<Envelope<Page<AuditEntry>>>;
  };
  dataExport(): Promise<Envelope<unknown>>;
  dataImport(json: unknown): Promise<Envelope<{ ok: boolean }>>;
  dataReset(): Promise<Envelope<{ ok: boolean }>>;
}

/** Cast the runtime api object onto the phase-2 contract surface. */
export function asP2(api: unknown): Phase2Api {
  return api as unknown as Phase2Api;
}

export function fmtTs(v: number | string): string {
  try {
    return new Date(typeof v === 'number' ? v : v).toLocaleString();
  } catch {
    return String(v);
  }
}
