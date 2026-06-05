// Maps player name → jersey asset require(). Falls back to undefined;
// KitBadge renders a club-colour dot when undefined.
const JERSEY_MAP: Record<string, number> = {
  // Squad members
  'Raya':          require('@/assets/jerseys/arsenal.png'),
  'Gabriel':       require('@/assets/jerseys/arsenal.png'),
  'Saka':          require('@/assets/jerseys/arsenal.png'),
  'Haaland':       require('@/assets/jerseys/manchester_city.png'),
  'Doku':          require('@/assets/jerseys/manchester_city.png'),
  'B. Fernandes':  require('@/assets/jerseys/manchester_united.png'),
  'Palmer':        require('@/assets/jerseys/chelsea.png'),
  'Watkins':       require('@/assets/jerseys/aston_villa.png'),
  'Solanke':       require('@/assets/jerseys/tottenham.png'),
  'Henderson':     require('@/assets/jerseys/crystal_palace.png'),
  'Truffert':      require('@/assets/jerseys/bournemouth.png'),
  'O.Dango':       require('@/assets/jerseys/brentford.png'),
  'Lacroix':       require('@/assets/jerseys/crystal_palace.png'),
  'Trakowski':     require('@/assets/jerseys/everton.png'),
  'Senesi':        require('@/assets/jerseys/bournemouth.png'),
  // Top Picks extras
  'Salah':         require('@/assets/jerseys/liverpool.png'),
  'Saliba':        require('@/assets/jerseys/arsenal.png'),
  'Van Dijk':      require('@/assets/jerseys/liverpool.png'),
  'Porro':         require('@/assets/jerseys/tottenham.png'),
  'Gvardiol':      require('@/assets/jerseys/manchester_city.png'),
  'Hall':          require('@/assets/jerseys/newcastle.png'),
  'Andersen':      require('@/assets/jerseys/fulham.png'),
  'Muñoz':         require('@/assets/jerseys/crystal_palace.png'),
  'Mbeumo':        require('@/assets/jerseys/manchester_united.png'),
  'Son':           require('@/assets/jerseys/tottenham.png'),
  'Semenyo':       require('@/assets/jerseys/bournemouth.png'),
  'Rogers':        require('@/assets/jerseys/aston_villa.png'),
  'Sánchez':       require('@/assets/jerseys/chelsea.png'),
  'Sels':          require('@/assets/jerseys/nottingham_forest.png'),
  'Pope':          require('@/assets/jerseys/newcastle.png'),
  'Pickford':      require('@/assets/jerseys/everton.png'),
  'Petrović':      require('@/assets/jerseys/bournemouth.png'),
  'Verbruggen':    require('@/assets/jerseys/brighton.png'),
  'Wood':          require('@/assets/jerseys/nottingham_forest.png'),
  'João Pedro':    require('@/assets/jerseys/chelsea.png'),
  'Jackson':       require('@/assets/jerseys/chelsea.png'),
  'Cunha':         require('@/assets/jerseys/manchester_united.png'),
  'Mateta':        require('@/assets/jerseys/crystal_palace.png'),
  'Walker':        require('@/assets/jerseys/manchester_city.png'),
};

export function jerseyFor(playerName: string): number | undefined {
  return JERSEY_MAP[playerName];
}
