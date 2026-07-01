// Self-hosted build: Lovable broker not available. Social OAuth disabled.
type SignInOptions = { redirect_uri?: string; extraParams?: Record<string, string> };
export const lovable = {
  auth: {
    signInWithOAuth: async (
      _provider: "google" | "apple" | "microsoft" | "lovable",
      _opts?: SignInOptions,
    ) => {
      return {
        redirected: false,
        error: new Error("自托管模式下未启用第三方登录，请使用邮箱密码登录。"),
      } as { redirected: boolean; error?: Error };
    },
  },
};
