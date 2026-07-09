export interface AuthUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
}
