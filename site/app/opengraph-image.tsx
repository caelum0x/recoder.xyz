import {
  renderSocialImage,
  SOCIAL_SIZE,
  SOCIAL_CONTENT_TYPE,
} from "./social-image";

export const alt = "Recoder — run your coding agents as a team";
export const size = SOCIAL_SIZE;
export const contentType = SOCIAL_CONTENT_TYPE;

export default function OpengraphImage() {
  return renderSocialImage();
}
