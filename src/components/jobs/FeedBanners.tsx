export interface FeedBannersProps {
  rulesAvailable: boolean;
  contactsAvailable: boolean;
}

/** Load-failure banners for the Jobs feed, so missing data isn't mistaken for "nothing here". */
export function FeedBanners({ rulesAvailable, contactsAvailable }: FeedBannersProps) {
  return (
    <>
      {rulesAvailable ? null : (
        <p className="banner hold" role="alert">
          Inroad couldn&apos;t load your campaign rules, so job statuses aren&apos;t shown right now. Nothing is applied
          while this is the case. Reload to try again.
        </p>
      )}
      {contactsAvailable ? null : (
        <p className="banner hold" role="alert">
          Inroad couldn&apos;t load your contacts, so warm paths aren&apos;t shown. Reload to try again.
        </p>
      )}
    </>
  );
}
