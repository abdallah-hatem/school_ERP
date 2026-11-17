import { LOGO_UPLOAD } from '@school-erp/shared';
import { imageUploadInterceptor } from './image-upload';

/** Reads the logo's multipart `file` field, refusing anything over 2 MB while it streams in. */
export const LogoUploadInterceptor = imageUploadInterceptor(LOGO_UPLOAD.maxBytes);
