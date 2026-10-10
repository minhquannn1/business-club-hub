/* Club photos bundled with the site (public/photos). Each has a full size
   and a -sm version for small frames. */
export interface ClubPhoto {
  src: string;
  sm: string;
  w: number;
  h: number;
  caption: string;
  alt: string;
}

const p = (name: string, w: number, h: number, caption: string, alt: string): ClubPhoto => ({
  src: `/photos/${name}.webp`,
  sm: `/photos/${name}-sm.webp`,
  w,
  h,
  caption,
  alt,
});

export const PHOTOS = {
  team: p('christmas-team', 1600, 896, 'the whole crew', 'Club members together behind the Christmas booth'),
  halloween: p('halloween-booth', 1400, 1049, 'Halloween booth', 'The decorated Business Club table at the Halloween booth'),
  crowd: p('christmas-crowd', 1400, 933, 'Christmas rush', 'Students crowding around the Christmas booth to buy'),
  sales: p('christmas-sales', 1400, 933, 'Christmas booth', 'Members serving students at the Christmas booth'),
  fair: p('school-fair', 1050, 1400, 'School fair', 'Tents and stalls at the school fair'),
  queue: p('fair-queue', 1050, 1400, 'The queue', 'Students lining up at the club stall during the school fair'),
  members: p('christmas-members', 1050, 1400, 'Behind the table', 'Members at the Christmas booth'),
  meeting: p('club-meeting', 1400, 933, 'club meeting', 'Members planning around laptops at a club meeting'),
  meeting2: p('club-meeting-2', 1400, 933, 'Planning session', 'Members working on laptops during a club meeting'),
  intl: p('international-day', 1400, 933, 'International Day', 'Younger students doing crafts at the International Day stall'),
};

export const GALLERY = [PHOTOS.halloween, PHOTOS.queue, PHOTOS.crowd, PHOTOS.meeting2, PHOTOS.intl, PHOTOS.fair, PHOTOS.sales];
