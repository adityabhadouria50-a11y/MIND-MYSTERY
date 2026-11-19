import {
  BookOpen,
  Calendar,
  CaseSensitive,
  Clapperboard,
  CloudSun,
  Film,
  Globe2,
  Hash,
  Mic2,
  Music,
  Palette,
  PawPrint,
  Trophy,
  Utensils,
} from 'lucide-react';
import type { CategoryId } from '../../shared/types.ts';

export function CategoryIcon({ category, className = 'w-5 h-5' }: { category: CategoryId; className?: string }) {
  switch (category) {
    case 'movie':
      return <Film className={className} />;
    case 'song':
      return <Music className={className} />;
    case 'actor':
      return <Clapperboard className={className} />;
    case 'singer':
      return <Mic2 className={className} />;
    case 'sports_person':
      return <Trophy className={className} />;
    case 'number':
      return <Hash className={className} />;
    case 'dob':
      return <Calendar className={className} />;
    case 'food':
      return <Utensils className={className} />;
    case 'place':
      return <Globe2 className={className} />;
    case 'colour':
      return <Palette className={className} />;
    case 'animal':
      return <PawPrint className={className} />;
    case 'weather':
      return <CloudSun className={className} />;
    case 'alphabet':
      return <CaseSensitive className={className} />;
    case 'word':
      return <BookOpen className={className} />;
    default:
      return <Film className={className} />;
  }
}
