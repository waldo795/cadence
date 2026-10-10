# Designing emails

How an email is built, how it is styled, and why it is a list of blocks
rather than a box of HTML.

See [Sending email](sending-email.md) for whether it actually goes out.

---

## Two separate jobs

| Where | Decides |
| --- | --- |
| **The send node**, in a journey | What this email *says* — the words, the images, the links. |
| **Settings → Email design** | What every email *looks like* — logo, colours, type, footer. |

Changing the design changes every journey at once, including ones already
running. That is the point: five countdown emails should look like they came
from the same business without anyone styling them five times.

---

## The designer

Select a Send Email node and click **Design email**. The designer opens
full-screen: blocks down the left, the actual rendered email down the right.

The preview runs the same renderer and the same merge-field resolution as a
live send, against a client you pick from the dropdown. So "One week to go,
{{profile.firstName}}" shows as "One week to go, Ava", with Ava's real venue
and date — and if a field cannot be filled in for her, a warning names it
while you type rather than after you send yourself a test.

A desktop / phone toggle switches the preview width. Most brides read on a
phone.

> **Why it works this way**
>
> It is a separate window rather than part of the properties panel because an
> email is 600px wide and the panel is under half that. Editing blocks in the
> sidebar meant never seeing what you were making — the loop was save, switch
> to test mode, send yourself one, check your inbox, go back.

> **Watch out**
>
> The preview's unsubscribe link is a placeholder. The real one is built per
> client at send time, so it cannot be clicked from here.

## Blocks

A body is a list of blocks.

| Block | Notes |
| --- | --- |
| **Paragraph** | Body copy. A blank line starts a new paragraph. |
| **Heading** | Title (once, at the top) or Section. |
| **Image** | Needs a public URL and a description. |
| **Button** | A label and a link. |
| **Divider** | A horizontal rule. |
| **Space** | Small, medium or large gap. |

Merge fields work in every one of them, including a button's link —
`https://example.com/{{profile.id}}` resolves per client.

> **Why it works this way**
>
> Blocks rather than an HTML editor, for three reasons. The simulator can
> still see each merge field, so it can tell you which ones will not resolve
> for a named client. The same content renders to HTML *and* a plain-text
> part without parsing anything back out. And the person writing the email is
> choosing between six things instead of editing markup.

> **Watch out**
>
> A button with no link is left out of the email entirely, rather than
> rendered as something that cannot be clicked. The editor warns you while
> the link is empty.

### Nothing needed migrating

A send node authored before the editor existed has only its original plain
text. Its blocks are derived from that text on the fly, splitting on blank
lines — which is the structure it was already written in. Opening the editor
changes nothing; the first edit saves the conversion.

The plain-text body is kept in step with the blocks, because it is still the
text part of every send.

---

## The design

**Settings → Email design.** Business name, logo, typeface, five colours, and
the footer. The preview beside the fields uses the real renderer with sample
copy; the designer previews the same theme against a real client.

> **Why it works this way**
>
> Email HTML is not web HTML. Outlook on Windows renders with Word's engine:
> no flexbox, no grid, external stylesheets stripped. Everything here is
> tables and inline styles, which looks archaic and is the only thing that
> works everywhere.
>
> Typefaces are system stacks only. Outlook and Gmail strip `@font-face` and
> fall back to Times, which looks worse than choosing a good stack.

> **Watch out**
>
> Most email clients block images until the reader allows them. The logo's
> alt text is your business name, and an image block's description is what
> most people see first — write it as if the picture never loads, because for
> many of them it will not.

---

## Unresolved merge fields stop a live send

If a field cannot be filled in for a particular client, `{{profile.venue}}`
appears in the email exactly as written. The simulator flags this; so does
the sender.

- **Live:** the send is **blocked** and recorded with the field named. A
  visibly broken email to a bride the week of her wedding is worse than a
  missing one somebody can chase.
- **Test:** the send goes through, braces and all. Seeing the break is the
  whole point of a test.

---

## Unsubscribe

Every marketing email gets an unsubscribe link in the footer automatically.
It cannot be turned off — it is legally required in the UK, and burying it
costs more in spam complaints than it saves in unsubscribes.

The link carries an HMAC of the client's id, so it opts out exactly one
person and cannot be edited into someone else's. It never expires: a dead
link in a year-old email leaves a spam complaint as the only way to stop the
mail, which costs the sending domain far more.

Clicking it opens a page with a confirmation button. It does **not**
unsubscribe on load, because inbox providers and corporate mail scanners
follow every link in a message to check it is safe — a link that acted on
GET would opt people out of emails they never opened.

Unsubscribing sets email consent to `unsubscribed`, which the policy
evaluator already honours everywhere.

> **Watch out**
>
> Links need `APP_URL` (or Railway's own domain) to be set. Without it,
> emails go out with **no unsubscribe link at all**, which is unlawful for
> marketing. Set it before going live.
