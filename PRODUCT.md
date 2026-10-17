# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Existing codebase: static HTML/CSS/JS (index.html, shop.html, product.html, checkout.html), content in `content/*.json` edited through a Git-based CMS in `admin/`, GitHub Pages (CNAME pashutlitzor.com), Cloudflare-style workers in `oauth-worker/` and `shop-worker/`.

## Users
Primarily women, in Israel, who book a creative workshop for themselves or a group: a private workshop, a girls' night, a celebration (birthday, bachelorette, team bonding) or a company event. They arrive mostly on mobile, in Hebrew (RTL), and the job is to feel confident enough to message the studio on WhatsApp.

## Product Purpose
"פשוט ליצור" is a boutique studio for polymer-plaster (גבס פולימרי) creation workshops: vases, designed objects and home decor. The site exists to generate WhatsApp leads for workshops. Success is a visitor tapping the WhatsApp button (wa.me/972525477845) and booking.

## Positioning
Hands-on personal creation in polymer plaster: each participant makes their own object, in a calm boutique setting, at the studio in Hispin (Golan Heights) or brought to the client anywhere in Israel with the equipment.

## Operating Context
Workshop types: private, girls' night, group celebrations, company events (on-site). Contact is by WhatsApp or phone 052-547-7845; social presence on Instagram (@dina_evgi) and Facebook. Content (gallery, videos, testimonials, products) is managed through the CMS in `admin/`, with a bulk image tool at `admin/bulk-images.html`.

## Capabilities and Constraints
- Hebrew, RTL throughout.
- Scroll-driven frame animation on a canvas (`frames/`) and the navigation menu are core components and must not break.
- The navbar is synced by hand between index.html, shop.html and product.html (no shared dynamic navbar).
- Shop (shop.html, product.html, checkout, order confirmation): currently hidden from navigation and `noindex`; status is "opening soon". It must not be promoted in SEO until the README's pre-launch items are done.
- Already done, do not repeat: robots.txt, sitemap.xml, llms.txt, LocalBusiness JSON-LD, canonical, absolute og:image.
- Open legal/accessibility items are tracked in README.md (photo consents, testimonial consents, music rights, per-image alt text, video captions, professional accessibility audit, third-party insurance).

## Brand Commitments
Keep the existing logo (`assets/branding/`), the polymer-concrete palette (concrete grey, terracotta, sand, deep teal, olive) and the self-hosted fonts in `assets/css/fonts.css`.

## Evidence on Hand
Gallery images and videos in `assets/`, testimonials in `content/testimonials.json` (consent for publishing still pending per README), prize/raffle assets. No fabricated reviews, prices, or customer counts should be added.

## Product Principles
1. The WhatsApp inquiry is the single conversion; every section should make it easier or more trusted.
2. Warm, personal and calm, matching a boutique studio rather than a mass-market event business.
3. Mobile and RTL first; performance on mid-range phones matters (scroll jank has already been a recurring problem).
4. Preserve the existing identity and core interactions; improve, do not replace.
5. Claims stay truthful and legally cautious.

## Accessibility & Inclusion
Israeli web accessibility expectations apply (accessibility statement exists; professional audit pending). Keyboard, screen reader, contrast, reduced-motion and RTL correctness are required.
