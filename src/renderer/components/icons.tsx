import type { SVGProps } from 'react';

function Icon(props: SVGProps<SVGSVGElement>) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props} />;
}

export function IconInvoicePlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9 12h4M11 10v4M9 16h6" />
    </Icon>
  );
}

export function IconBillPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </Icon>
  );
}

export function IconDollarCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5c0-1.4 1.2-2 2.5-2s2.5.7 2.5 1.8c0 2.4-5 1-5 3.4 0 1.1 1.2 1.8 2.5 1.8s2.5-.6 2.5-2" />
    </Icon>
  );
}

export function IconBank(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 10 12 4l9 6M4 10h16v9H4z" />
      <path d="M4 19h16M8 13v4M12 13v4M16 13v4" />
    </Icon>
  );
}

export function IconCamera(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </Icon>
  );
}

export function IconCloudUpload(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 18a4 4 0 1 1 .5-8 5 5 0 0 1 9.6 1.8A3.5 3.5 0 0 1 17 18H7Z" />
      <path d="M12 10v6M9.5 12.5 12 10l2.5 2.5" />
    </Icon>
  );
}

export function IconBarChart(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 19V10M12 19V5M19 19v-7" />
      <path d="M3 19h18" />
    </Icon>
  );
}

export function IconGear(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.8-1l-.3-2.5H9l-.3 2.5a7.6 7.6 0 0 0-1.8 1l-2.3-.9-2 3.4L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.8 1l.3 2.5h4.8l.3-2.5a7.6 7.6 0 0 0 1.8-1l2.3.9 2-3.4Z" />
    </Icon>
  );
}

export function IconHelp(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 1.9-2.4 3.7" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </Icon>
  );
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function IconHome(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-6h4v6" />
    </Icon>
  );
}

export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="16" height="15" rx="1.5" />
      <path d="M4 9.5h16M8 3v3.5M16 3v3.5" />
    </Icon>
  );
}

export function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M14.5 19a4 4 0 0 1 6.5-3.1" />
    </Icon>
  );
}

export function IconBuilding(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="5" y="3.5" width="10" height="17" rx="1" />
      <path d="M15 9h4v11.5h-4M8 7h1.5M8 10.5h1.5M8 14h1.5M11.5 7h1.5M11.5 10.5h1.5M11.5 14h1.5M9 20.5v-4h2v4" />
    </Icon>
  );
}

export function IconCart(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 4h2l2.2 11h10.6L20 8.5H6.2" />
      <circle cx="10" cy="19.5" r="1.4" />
      <circle cx="17" cy="19.5" r="1.4" />
    </Icon>
  );
}

export function IconUserGroup(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M2.5 19.5a5.5 5.5 0 0 1 11 0M11.5 19.5a5.5 5.5 0 0 1 11 0" />
    </Icon>
  );
}

export function IconReceipt(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </Icon>
  );
}

export function IconArrowsLeftRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 8h14M14 4l4 4-4 4" />
      <path d="M20 16H6M10 12l-4 4 4 4" />
    </Icon>
  );
}

export function IconShoppingBag(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 8h12l1 12.5H5Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </Icon>
  );
}

export function IconPeople(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="7.5" r="3" />
      <path d="M3 19a6 6 0 0 1 12 0" />
      <path d="M15.5 5.5a3 3 0 0 1 0 5.8M19 19a5.2 5.2 0 0 0-3.3-4.9" />
    </Icon>
  );
}

export function IconBook(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5Z" />
      <path d="M12 3h5.5A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5H12" />
      <path d="M7 8h3M7 11.5h3" />
    </Icon>
  );
}

export function IconLedger(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M4 9.5h16M9.5 9.5V20" />
    </Icon>
  );
}

export function IconClipboardCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      {/* A clipboard of ticked items with the final decision stamped on the corner. */}
      <path d="M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h5.5" />
      <path d="M16 4h2a1 1 0 0 1 1 1v6" />
      <rect x="8" y="2.5" width="8" height="3" rx="1" />
      <path d="M8 10l1.2 1.2L11.5 9M13 10.5h4M8 14.5l1.2 1.2L11.5 13.5M13 15h2.5" />
      <circle cx="17" cy="18" r="3.5" />
      <path d="M15.4 18l1.1 1.1 2.2-2.3" />
    </Icon>
  );
}

export function IconTaxForm(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      {/* A tax form with a dollar sign, and a calculator tucked against its corner. */}
      <path d="M4 3h11v8.5M4 3v17h6.5" />
      <path d="M4 7h11" />
      <path d="M11 10.2c-1.2-.9-3.2-.5-3.2.8 0 1.6 3.4.8 3.4 2.5 0 1.3-2.1 1.7-3.4.8M9.6 9.3v6" />
      <rect x="13" y="13" width="8" height="9" rx="1" />
      <path d="M14.8 15h4.4M15 17.5h1M18 17.5h1M15 19.8h1M18 19.8h1" />
    </Icon>
  );
}

export function IconPercent(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
      <path d="M18 6 6 18" />
    </Icon>
  );
}

export function IconFileText(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 3h7l4 4v14H7Z" />
      <path d="M14 3v4h4M9.5 12h5M9.5 15.5h5M9.5 8.5h1.5" />
    </Icon>
  );
}

export function IconMonitor(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4" width="19" height="13" rx="1.5" />
      <path d="M8.5 21h7M12 17v4" />
    </Icon>
  );
}

export function IconSave(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M8 3v6h7V3M7 21v-7h10v7" />
    </Icon>
  );
}

export function IconShare(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.7 15.8 6.3M8.2 13.3l7.6 4.4" />
    </Icon>
  );
}

export function IconRefresh(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </Icon>
  );
}

export function IconUndo(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 7 3 11l4 4" />
      <path d="M3 11h11a6 6 0 0 1 0 12h-2" />
    </Icon>
  );
}

export function IconRedo(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M17 7 21 11l-4 4" />
      <path d="M21 11H10a6 6 0 0 0 0 12h2" />
    </Icon>
  );
}

export function IconCalculator(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M8 7h8M8 11h1.5M11.5 11h1.5M15 11h1.5M8 14.5h1.5M11.5 14.5h1.5M15 14.5h1.5M8 18h1.5M11.5 18h1.5M15 18h1.5" />
    </Icon>
  );
}

export function IconLock(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <circle cx="12" cy="14.7" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconPencil(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      <path d="M14.5 5.5l3 3" />
    </Icon>
  );
}

export function IconShieldCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  );
}

/** WhatsApp's own brand mark (filled green circle + white handset/chat glyph) — used instead of
 * the 💬 emoji so the WhatsApp send links are actually recognizable as WhatsApp, not a generic
 * chat bubble that renders in whatever color the OS emoji font picks. */
export function IconSparkles(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
      <path d="M12 8l1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2Z" />
    </Icon>
  );
}

export function IconWhatsApp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path
        fill="#FFFFFF"
        d="M12 5.5a6.5 6.5 0 0 0-5.6 9.8L5.5 18.5l3.3-.87A6.5 6.5 0 1 0 12 5.5Zm0 1.3a5.2 5.2 0 1 1-2.66 9.66l-.2-.12-1.98.52.53-1.93-.13-.2A5.2 5.2 0 0 1 12 6.8Zm-2.62 2.5c-.14 0-.36.05-.55.27-.19.21-.72.7-.72 1.72s.74 2 .84 2.13c.1.14 1.44 2.28 3.55 3.1 1.76.68 2.11.55 2.5.51.38-.03 1.23-.5 1.4-.99.18-.48.18-.9.13-.99-.05-.08-.19-.14-.4-.24-.2-.1-1.24-.61-1.43-.68-.19-.07-.33-.1-.47.1-.14.21-.54.68-.66.82-.12.14-.24.16-.45.05-.2-.1-.86-.32-1.64-1.02-.6-.55-1.02-1.22-1.14-1.42-.12-.21-.01-.32.09-.42.09-.1.2-.24.3-.36.1-.12.13-.21.2-.35.07-.14.03-.26-.02-.36-.05-.1-.47-1.16-.66-1.58-.17-.4-.35-.35-.47-.35Z"
      />
    </svg>
  );
}

export function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
