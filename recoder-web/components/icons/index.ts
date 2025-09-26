import ArrowLeft from './arrow-left';
import ArrowRight from './arrow-right';
import ChevronLeft from './chevron-left';
import ChevronRight from './chevron-right';
import CloseIcon from './close-icon';
import GithubIcon from './github-icon';
import Lightbulb from './lightbulb';
import LightningBolt from './lightning-bolt';
import LogoSmall from './logo-small';
import PlayIcon from './play-icon';
import Refresh from './refresh';
import ShareIcon from './share-icon';
import UploadIcon from './upload-icon';
import XIcon from './x-icon';

// Re-export lucide-react icons for convenience
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  Check,
  AlertTriangle,
  Info,
  X,
  Settings,
  Menu,
  Search,
  Bell,
  User,
  Home,
  Plus,
  Minus,
  Edit,
  Trash,
  Eye,
  EyeOff,
  Download,
  Upload,
  ExternalLink,
  Copy,
  Share,
  Star,
  Heart,
  MessageCircle,
  Send,
  Calendar,
  Clock,
  MapPin,
  Phone,
  Mail,
  Lock,
  Unlock,
  Key,
  Shield,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  MoreVertical,
  Filter,
  SortAsc,
  SortDesc
} from 'lucide-react';

// React Icons for OAuth providers
import { FaGoogle, FaGithub } from 'react-icons/fa';

// Custom icons
export {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CloseIcon,
  GithubIcon,
  Lightbulb,
  LightningBolt,
  LogoSmall,
  PlayIcon,
  Refresh,
  ShareIcon,
  UploadIcon,
  XIcon,
};

// Lucide icons with aliases for convenience
export const Icons = {
  // Custom icons
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  close: CloseIcon,
  github: GithubIcon,
  lightbulb: Lightbulb,
  lightning: LightningBolt,
  logo: LogoSmall,
  play: PlayIcon,
  refresh: Refresh,
  share: ShareIcon,
  upload: UploadIcon,
  x: XIcon,
  
  // OAuth provider icons
  google: FaGoogle,
  gitHub: FaGithub,
  
  // Lucide icons
  spinner: Loader2,
  loading: Loader2,
  loader: Loader2,
  alertCircle: AlertCircle,
  alert: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  checkCircle: CheckCircle,
  check: Check,
  success: Check,
  error: X,
  settings: Settings,
  menu: Menu,
  search: Search,
  bell: Bell,
  notification: Bell,
  user: User,
  home: Home,
  plus: Plus,
  add: Plus,
  minus: Minus,
  remove: Minus,
  edit: Edit,
  trash: Trash,
  delete: Trash,
  eye: Eye,
  eyeOff: EyeOff,
  download: Download,
  uploadLucide: Upload, // Avoid conflict with UploadIcon
  externalLink: ExternalLink,
  copy: Copy,
  shareLucide: Share, // Avoid conflict with ShareIcon
  star: Star,
  heart: Heart,
  messageCircle: MessageCircle,
  message: MessageCircle,
  send: Send,
  calendar: Calendar,
  clock: Clock,
  time: Clock,
  mapPin: MapPin,
  location: MapPin,
  phone: Phone,
  mail: Mail,
  email: Mail,
  lock: Lock,
  unlock: Unlock,
  key: Key,
  shield: Shield,
  security: Shield,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  moreHorizontal: MoreHorizontal,
  moreVertical: MoreVertical,
  filter: Filter,
  sortAsc: SortAsc,
  sortDesc: SortDesc,
};

export default Icons;