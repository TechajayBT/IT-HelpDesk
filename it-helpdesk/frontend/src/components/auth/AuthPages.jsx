/**
 * Auth Pages — Login & Register
 *
 * Both pages use controlled forms with inline validation.
 * On success, Redux dispatches update global state and React Router navigates
 * to the role-appropriate home page.
 *
 * Design: Clean two-column layout on desktop (branded left panel + form right),
 * single column on mobile.
 */

import { CheckCircle, Eye, EyeOff, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  clearError,
  loginUser,
  registerUser,
  selectAuthError,
  selectAuthLoading,
  selectIsAuthenticated,
  selectUserRole,
} from "../../store/slices/authSlice";
import { ErrorBanner, Spinner } from "../common";

// ── Shared helpers ────────────────────────────────────────────────────────────

const BrandPanel = () => (
  <div className="hidden lg:flex flex-col justify-between bg-primary-900 text-white p-10 lg:w-2/5 xl:w-1/2">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
        <Ticket className="w-5 h-5 text-white" />
      </div>
      <span className="text-xl font-bold tracking-tight">IT Helpdesk</span>
    </div>

    <div>
      <h1 className="text-4xl font-bold mb-4 leading-tight">
        Streamline your IT support requests
      </h1>
      <p className="text-primary-200 text-base leading-relaxed mb-8">
        Create, track, and resolve support tickets with full transparency. Built for teams that care about accountability.
      </p>
      <ul className="space-y-3">
        {[
          "Real-time ticket status tracking",
          "Role-based access for requesters and agents",
          "Complete audit trail for every action",
          "Dashboard analytics at a glance",
        ].map((feature) => (
          <li key={feature} className="flex items-center gap-3 text-sm text-primary-100">
            <CheckCircle className="w-4 h-4 text-primary-300 flex-shrink-0" />
            {feature}
          </li>
        ))}
      </ul>
    </div>

    <p className="text-xs text-primary-400">IT Helpdesk Portal © 2026</p>
  </div>
);

const PasswordInput = ({ id, value, onChange, placeholder, error }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={id === "password" ? "current-password" : "new-password"}
        className={error ? "form-input-error pr-10" : "form-input pr-10"}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export const LoginPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoading = useSelector(selectAuthLoading);
  const error = useSelector(selectAuthError);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const userRole = useSelector(selectUserRole);

  const [form, setForm] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});

  // Redirect after successful login
  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname;
      const defaultPath = userRole === "agent" || userRole === "admin" ? "/agent/queue" : "/dashboard";
      navigate(from || defaultPath, { replace: true });
    }
  }, [isAuthenticated, userRole, navigate, location]);

  // Clear auth error when user starts typing
  useEffect(() => {
    if (error) dispatch(clearError());
  }, [form.email, form.password]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear individual field error on change
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Client-side validation before submitting
  const validate = () => {
    const errors = {};
    if (!form.email) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errors.email = "Invalid email format";
    if (!form.password) errors.password = "Password is required";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    dispatch(loginUser({ email: form.email, password: form.password }));
  };

  const sessionExpired = location.search.includes("session=expired");

  return (
    <div className="min-h-screen flex">
      <BrandPanel />

      {/* ── Form side ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
              <Ticket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">IT Helpdesk</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-sm text-slate-500 mb-6">Sign in to your account to continue</p>

          {sessionExpired && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              Your session expired. Please sign in again.
            </div>
          )}

          {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="form-label">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@company.com"
                className={fieldErrors.email ? "form-input-error" : "form-input"}
              />
              {fieldErrors.email && (
                <p className="form-error">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="form-label">Password</label>
              <PasswordInput
                id="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Your password"
                error={fieldErrors.password}
              />
              {fieldErrors.password && (
                <p className="form-error">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-2.5 mt-2"
              disabled={isLoading}
            >
              {isLoading ? <><Spinner size="sm" /> Signing in...</> : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary-600 font-medium hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER PAGE
// ─────────────────────────────────────────────────────────────────────────────

const PASSWORD_RULES = [
  { test: (p) => p.length >= 8,          label: "At least 8 characters" },
  { test: (p) => /[A-Z]/.test(p),        label: "One uppercase letter" },
  { test: (p) => /[a-z]/.test(p),        label: "One lowercase letter" },
  { test: (p) => /\d/.test(p),           label: "One number" },
  { test: (p) => /[@$!%*?&#]/.test(p),   label: "One special character (@$!%*?&#)" },
];

// export const RegisterPage = () => {
//   const dispatch = useDispatch();
//   const navigate = useNavigate();
//   const isLoading = useSelector(selectAuthLoading);
//   const error = useSelector(selectAuthError);
//   const isAuthenticated = useSelector(selectIsAuthenticated);

//   const [form, setForm] = useState({
//     firstName: "", lastName: "", email: "",
//     password: "", confirmPassword: "",
//   });
//   const [fieldErrors, setFieldErrors] = useState({});
//   const [showPasswordRules, setShowPasswordRules] = useState(false);

//   useEffect(() => {
//     if (isAuthenticated) navigate("/dashboard", { replace: true });
//   }, [isAuthenticated, navigate]);

//   useEffect(() => {
//     if (error) dispatch(clearError());
//   }, [form]);

//   const handleChange = (e) => {
//     const { name, value } = e.target;
//     setForm((prev) => ({ ...prev, [name]: value }));
//     if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: "" }));
//   };

//   const validate = () => {
//     const errors = {};
//     if (!form.firstName.trim()) errors.firstName = "First name is required";
//     if (!form.lastName.trim()) errors.lastName = "Last name is required";
//     if (!form.email) errors.email = "Email is required";
//     else if (!/\S+@\S+\.\S+/.test(form.email)) errors.email = "Invalid email format";

//     // Check all password complexity rules
//     const failedRules = PASSWORD_RULES.filter((r) => !r.test(form.password));
//     if (!form.password) {
//       errors.password = "Password is required";
//     } else if (failedRules.length > 0) {
//       errors.password = `Password must have: ${failedRules.map((r) => r.label).join(", ")}`;
//     }

//     if (!form.confirmPassword) {
//       errors.confirmPassword = "Please confirm your password";
//     } else if (form.password !== form.confirmPassword) {
//       errors.confirmPassword = "Passwords do not match";
//     }

//     setFieldErrors(errors);
//     return Object.keys(errors).length === 0;
//   };

//   const handleSubmit = (e) => {
//     e.preventDefault();
//     if (!validate()) return;
//     dispatch(registerUser(form));
//   };

//   return (
//     <div className="min-h-screen flex">
//       <BrandPanel />

//       <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white overflow-y-auto">
//         <div className="w-full max-w-sm py-4">
//           {/* Mobile logo */}
//           <div className="flex items-center gap-2 mb-8 lg:hidden">
//             <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
//               <Ticket className="w-4 h-4 text-white" />
//             </div>
//             <span className="font-bold text-slate-900">IT Helpdesk</span>
//           </div>

//           <h2 className="text-2xl font-bold text-slate-900 mb-1">Create account</h2>
//           <p className="text-sm text-slate-500 mb-6">Get started with IT Helpdesk today</p>

//           {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

//           <form onSubmit={handleSubmit} noValidate className="space-y-4">
//             {/* Name row */}
//             <div className="grid grid-cols-2 gap-3">
//               <div>
//                 <label htmlFor="firstName" className="form-label">First name</label>
//                 <input
//                   id="firstName" name="firstName" type="text"
//                   autoComplete="given-name"
//                   value={form.firstName} onChange={handleChange}
//                   placeholder="Jane"
//                   className={fieldErrors.firstName ? "form-input-error" : "form-input"}
//                 />
//                 {fieldErrors.firstName && <p className="form-error">{fieldErrors.firstName}</p>}
//               </div>
//               <div>
//                 <label htmlFor="lastName" className="form-label">Last name</label>
//                 <input
//                   id="lastName" name="lastName" type="text"
//                   autoComplete="family-name"
//                   value={form.lastName} onChange={handleChange}
//                   placeholder="Smith"
//                   className={fieldErrors.lastName ? "form-input-error" : "form-input"}
//                 />
//                 {fieldErrors.lastName && <p className="form-error">{fieldErrors.lastName}</p>}
//               </div>
//             </div>

//             {/* Email */}
//             <div>
//               <label htmlFor="email" className="form-label">Email address</label>
//               <input
//                 id="email" name="email" type="email"
//                 autoComplete="email"
//                 value={form.email} onChange={handleChange}
//                 placeholder="you@company.com"
//                 className={fieldErrors.email ? "form-input-error" : "form-input"}
//               />
//               {fieldErrors.email && <p className="form-error">{fieldErrors.email}</p>}
//             </div>

//             {/* Password */}
//             <div>
//               <label htmlFor="password" className="form-label">Password</label>
//               <PasswordInput
//                 id="password" value={form.password}
//                 onChange={handleChange} placeholder="Create a strong password"
//                 error={fieldErrors.password}
//               />
//               {fieldErrors.password && <p className="form-error">{fieldErrors.password}</p>}

//               {/* Password strength checklist */}
//               {(showPasswordRules || form.password) && (
//                 <ul className="mt-2 space-y-1">
//                   {PASSWORD_RULES.map((rule) => {
//                     const passed = rule.test(form.password);
//                     return (
//                       <li key={rule.label} className={`text-xs flex items-center gap-1.5 ${passed ? "text-green-600" : "text-slate-400"}`}>
//                         <span>{passed ? "✓" : "○"}</span>
//                         {rule.label}
//                       </li>
//                     );
//                   })}
//                 </ul>
//               )}

//               {!form.password && (
//                 <button type="button" onClick={() => setShowPasswordRules(true)} className="mt-1 text-xs text-primary-600 hover:underline">
//                   View password requirements
//                 </button>
//               )}
//             </div>

//             {/* Confirm Password */}
//             <div>
//               <label htmlFor="confirmPassword" className="form-label">Confirm password</label>
//               <PasswordInput
//                 id="confirmPassword" value={form.confirmPassword}
//                 onChange={handleChange} placeholder="Repeat your password"
//                 error={fieldErrors.confirmPassword}
//               />
//               {fieldErrors.confirmPassword && <p className="form-error">{fieldErrors.confirmPassword}</p>}
//             </div>

//             <button type="submit" className="btn-primary w-full py-2.5 mt-2" disabled={isLoading}>
//               {isLoading ? <><Spinner size="sm" /> Creating account...</> : "Create account"}
//             </button>
//           </form>

//           <p className="mt-6 text-center text-sm text-slate-600">
//             Already have an account?{" "}
//             <Link to="/login" className="text-primary-600 font-medium hover:underline">
//               Sign in
//             </Link>
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// };

export const RegisterPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const isLoading = useSelector(selectAuthLoading);
  const error = useSelector(selectAuthError);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [showPasswordRules, setShowPasswordRules] = useState(false);

  // ✅ Redirect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // ✅ Clear error on typing
  useEffect(() => {
    if (error) dispatch(clearError());
  }, [form, dispatch]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  // ✅ Validation
  const validate = () => {
    const errors = {};

    if (!form.firstName.trim()) errors.firstName = "First name is required";
    if (!form.lastName.trim()) errors.lastName = "Last name is required";

    if (!form.email) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email))
      errors.email = "Invalid email format";

    const failedRules = PASSWORD_RULES.filter((r) => !r.test(form.password));

    if (!form.password) {
      errors.password = "Password is required";
    } else if (failedRules.length > 0) {
      errors.password = `Password must have: ${failedRules
        .map((r) => r.label)
        .join(", ")}`;
    }

    if (!form.confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (form.password !== form.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ✅ 🚀 MAIN FIX: Auto-login after register
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const resultAction = await dispatch(registerUser(form));

      if (registerUser.fulfilled.match(resultAction)) {
        // 👉 Auto login after successful registration
        await dispatch(
          loginUser({
            email: form.email,
            password: form.password,
          })
        );
      }
    } catch (err) {
      console.error("Registration error:", err);
    }
  };

  return (
    <div className="min-h-screen flex">
      <BrandPanel />

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white overflow-y-auto">
        <div className="w-full max-w-sm py-4">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
              <Ticket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">IT Helpdesk</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">
            Create account
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Get started with IT Helpdesk today
          </p>

          {error && (
            <div className="mb-4">
              <ErrorBanner message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">First name</label>
                <input
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  className={
                    fieldErrors.firstName
                      ? "form-input-error"
                      : "form-input"
                  }
                />
                {fieldErrors.firstName && (
                  <p className="form-error">{fieldErrors.firstName}</p>
                )}
              </div>

              <div>
                <label className="form-label">Last name</label>
                <input
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  className={
                    fieldErrors.lastName
                      ? "form-input-error"
                      : "form-input"
                  }
                />
                {fieldErrors.lastName && (
                  <p className="form-error">{fieldErrors.lastName}</p>
                )}
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="form-label">Email</label>
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                className={
                  fieldErrors.email ? "form-input-error" : "form-input"
                }
              />
              {fieldErrors.email && (
                <p className="form-error">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="form-label">Password</label>
              <PasswordInput
                id="password"
                value={form.password}
                onChange={handleChange}
                error={fieldErrors.password}
              />

              {fieldErrors.password && (
                <p className="form-error">{fieldErrors.password}</p>
              )}

              {(showPasswordRules || form.password) && (
                <ul className="mt-2 space-y-1">
                  {PASSWORD_RULES.map((rule) => {
                    const passed = rule.test(form.password);
                    return (
                      <li
                        key={rule.label}
                        className={`text-xs flex items-center gap-1.5 ${
                          passed ? "text-green-600" : "text-slate-400"
                        }`}
                      >
                        {passed ? "✓" : "○"} {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="form-label">Confirm Password</label>
              <PasswordInput
                id="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                error={fieldErrors.confirmPassword}
              />

              {fieldErrors.confirmPassword && (
                <p className="form-error">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-2.5 mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" /> Processing...
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-primary-600 font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};