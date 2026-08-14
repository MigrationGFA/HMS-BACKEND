export interface AuthUser {
  id: number;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  /** True when GENERATE_PIN = Y (migrated staff must reset temporary PIN). */
  mustResetPassword: boolean;
}
