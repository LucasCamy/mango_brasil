export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: Record<string, string[]>;
}
export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
  }
}
/** Mutations are never retried implicitly. Callers retain their UUIDv7 keys on retry. */
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    let problem: ProblemDetails;
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      problem = {
        type: "about:blank",
        title: "Não foi possível concluir a operação",
        status: response.status,
      };
    }
    if (
      response.status === 401 &&
      path !== "/auth/me" &&
      path !== "/auth/login"
    )
      window.dispatchEvent(new CustomEvent("session-expired"));
    throw new ApiError(problem);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const post = <T>(
  path: string,
  body: unknown,
  supervisorToken?: string,
) =>
  api<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: supervisorToken ? { "x-supervisor-token": supervisorToken } : {},
  });
export const patch = <T>(
  path: string,
  body: unknown,
  supervisorToken?: string,
) =>
  api<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: supervisorToken ? { "x-supervisor-token": supervisorToken } : {},
  });
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
