/**
 * Create Ticket Page
 *
 * Multi-field form for submitting a new support ticket.
 *
 * Features:
 * - Category-driven subcategory dropdown (dependent selects)
 * - Hardware-specific extra fields (device type, OS, location)
 * - File attachment with drag-and-drop, size/type/count validation
 * - Inline validation on submit
 * - Navigates to ticket detail on success
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Upload, X, FileText, AlertCircle } from "lucide-react";
import { ticketApi } from "../../services/api";
import { CATEGORY_SUBCATEGORIES } from "./TicketList";
import { Spinner } from "../common";
import { formatFileSize } from "../../utils/helpers";
import { toast } from "react-toastify";

// Upload constraints (must match backend env config)
const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "application/pdf", "text/plain"];

const INITIAL_FORM = {
  title: "",
  description: "",
  type: "",
  category: "",
  subcategory: "",
  priority: "",
  extraFields: { deviceType: "", operatingSystem: "", location: "" },
};

const CreateTicketPage = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [attachments, setAttachments] = useState([]); // Array of File objects
  const [attachmentErrors, setAttachmentErrors] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  // ── Derived subcategory list based on selected category ──────────────────
  const subcategories = form.category ? CATEGORY_SUBCATEGORIES[form.category] || [] : [];

  // ── Mutation: POST /api/tickets ───────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (formData) => {
      // 1. Create the ticket
      const ticket = await ticketApi.createTicket(formData);

      // 2. Upload attachments if any (sequential to avoid overwhelming the server)
      for (const file of attachments) {
        await ticketApi.uploadAttachment(ticket._id, file);
      }

      return ticket;
    },
    onSuccess: (ticket) => {
      toast.success(`Ticket ${ticket.ticketNumber} created successfully!`);
      navigate(`/tickets/${ticket._id}`);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create ticket");
    },
  });

  // ── Form handlers ─────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name.startsWith("extraFields.")) {
      const field = name.split(".")[1];
      setForm((prev) => ({
        ...prev,
        extraFields: { ...prev.extraFields, [field]: value },
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }

    // Reset subcategory when category changes — old subcategory is no longer valid
    if (name === "category") {
      setForm((prev) => ({ ...prev, category: value, subcategory: "" }));
    }

    // Clear field error on change
    const errorKey = name.startsWith("extraFields.") ? name.split(".")[1] : name;
    if (errors[errorKey]) {
      setErrors((prev) => ({ ...prev, [errorKey]: "" }));
    }
  };

  // ── File attachment handlers ──────────────────────────────────────────────

  const validateAndAddFiles = (newFiles) => {
    const fileErrors = [];
    const validFiles = [];

    for (const file of newFiles) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        fileErrors.push(`"${file.name}": File type not allowed (${file.type})`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        fileErrors.push(`"${file.name}": File exceeds 5MB limit`);
        continue;
      }
      validFiles.push(file);
    }

    setAttachmentErrors(fileErrors);

    setAttachments((prev) => {
      const combined = [...prev, ...validFiles];
      if (combined.length > MAX_FILES) {
        setAttachmentErrors((e) => [...e, `Maximum ${MAX_FILES} files allowed`]);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  const handleFileInput = (e) => {
    validateAndAddFiles(Array.from(e.target.files));
    e.target.value = ""; // Reset input so the same file can be re-added after removal
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    validateAndAddFiles(Array.from(e.dataTransfer.files));
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = () => {
    const errs = {};
    if (!form.title.trim() || form.title.trim().length < 5) errs.title = "Title must be at least 5 characters";
    if (!form.description.trim() || form.description.trim().length < 10) errs.description = "Description must be at least 10 characters";
    if (!form.type) errs.type = "Type is required";
    if (!form.category) errs.category = "Category is required";
    if (!form.subcategory) errs.subcategory = "Subcategory is required";
    if (!form.priority) errs.priority = "Priority is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) {
      // Scroll to first error for accessibility
      document.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Clean up empty extraFields before sending
    const cleanedExtraFields = Object.fromEntries(
      Object.entries(form.extraFields).map(([k, v]) => [k, v || null])
    );

    createMutation.mutate({ ...form, extraFields: cleanedExtraFields });
  };

  const isSubmitting = createMutation.isPending;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Create New Ticket</h1>
          <p className="page-subtitle">Submit a support request to the IT team</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="card p-6 space-y-5">

          {/* Title */}
          <div>
            <label htmlFor="title" className="form-label">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title" name="title" type="text"
              value={form.title} onChange={handleChange}
              placeholder="Brief summary of the issue"
              className={errors.title ? "form-input-error" : "form-input"}
              data-error={errors.title ? true : undefined}
            />
            {errors.title && <p className="form-error"><AlertCircle className="w-3 h-3" />{errors.title}</p>}
          </div>

          {/* Type + Priority row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="type" className="form-label">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                id="type" name="type"
                value={form.type} onChange={handleChange}
                className={errors.type ? "form-input-error form-select" : "form-select"}
              >
                <option value="">Select type...</option>
                <option value="Incident">Incident</option>
                <option value="Service Request">Service Request</option>
              </select>
              {errors.type && <p className="form-error"><AlertCircle className="w-3 h-3" />{errors.type}</p>}
            </div>

            <div>
              <label htmlFor="priority" className="form-label">
                Priority <span className="text-red-500">*</span>
              </label>
              <select
                id="priority" name="priority"
                value={form.priority} onChange={handleChange}
                className={errors.priority ? "form-input-error form-select" : "form-select"}
              >
                <option value="">Select priority...</option>
                <option value="Low">Low</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
              {errors.priority && <p className="form-error"><AlertCircle className="w-3 h-3" />{errors.priority}</p>}
            </div>
          </div>

          {/* Category + Subcategory row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="category" className="form-label">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="category" name="category"
                value={form.category} onChange={handleChange}
                className={errors.category ? "form-input-error form-select" : "form-select"}
              >
                <option value="">Select category...</option>
                {Object.keys(CATEGORY_SUBCATEGORIES).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.category && <p className="form-error"><AlertCircle className="w-3 h-3" />{errors.category}</p>}
            </div>

            <div>
              <label htmlFor="subcategory" className="form-label">
                Subcategory <span className="text-red-500">*</span>
              </label>
              <select
                id="subcategory" name="subcategory"
                value={form.subcategory} onChange={handleChange}
                disabled={!form.category}
                className={errors.subcategory ? "form-input-error form-select" : "form-select"}
              >
                <option value="">{form.category ? "Select subcategory..." : "Select category first"}</option>
                {subcategories.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors.subcategory && <p className="form-error"><AlertCircle className="w-3 h-3" />{errors.subcategory}</p>}
            </div>
          </div>

          {/* Hardware-specific extra fields */}
          {form.category === "Hardware" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="sm:col-span-3 text-xs font-semibold text-slate-500 uppercase tracking-wide -mb-1">
                Device Information
              </p>
              <div>
                <label className="form-label text-xs">Device Type</label>
                <select name="extraFields.deviceType" value={form.extraFields.deviceType}
                  onChange={handleChange} className="form-select text-xs h-9">
                  <option value="">Select...</option>
                  {["Laptop", "Desktop", "Mobile"].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label text-xs">Operating System</label>
                <select name="extraFields.operatingSystem" value={form.extraFields.operatingSystem}
                  onChange={handleChange} className="form-select text-xs h-9">
                  <option value="">Select...</option>
                  {["Windows", "macOS", "Other"].map((os) => <option key={os} value={os}>{os}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label text-xs">Location</label>
                <select name="extraFields.location" value={form.extraFields.location}
                  onChange={handleChange} className="form-select text-xs h-9">
                  <option value="">Select...</option>
                  {["Office", "Remote"].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label htmlFor="description" className="form-label">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description" name="description"
              value={form.description} onChange={handleChange}
              rows={5}
              placeholder="Describe the issue in detail — include what happened, when it started, and any error messages..."
              className={errors.description ? "form-input-error form-textarea" : "form-textarea"}
            />
            {errors.description && <p className="form-error"><AlertCircle className="w-3 h-3" />{errors.description}</p>}
          </div>

          {/* Attachment upload */}
          <div>
            <label className="form-label">
              Attachments <span className="text-slate-400 font-normal text-xs">(optional, max {MAX_FILES} files, 5MB each)</span>
            </label>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={[
                "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
                isDragging ? "border-primary-400 bg-primary-50" : "border-slate-200 hover:border-slate-300 bg-slate-50",
                attachments.length >= MAX_FILES ? "opacity-50 cursor-not-allowed pointer-events-none" : "",
              ].join(" ")}
              onClick={() => document.getElementById("file-input").click()}
            >
              <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600">
                <span className="text-primary-600 font-medium">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-slate-400 mt-1">
                JPEG, PNG, GIF, PDF, TXT up to 5MB
              </p>
              <input
                id="file-input" type="file" multiple className="hidden"
                accept={ALLOWED_MIME_TYPES.join(",")}
                onChange={handleFileInput}
              />
            </div>

            {/* Attachment error messages */}
            {attachmentErrors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {attachmentErrors.map((err, i) => (
                  <li key={i} className="form-error">{err}</li>
                ))}
              </ul>
            )}

            {/* Attached files list */}
            {attachments.length > 0 && (
              <ul className="mt-3 space-y-2">
                {attachments.map((file, i) => (
                  <li key={i} className="flex items-center gap-3 p-2.5 bg-white border border-slate-200 rounded-lg text-sm">
                    <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="flex-1 truncate text-slate-700">{file.name}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="text-slate-400 hover:text-red-500 flex-shrink-0"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Form actions */}
        <div className="flex items-center justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? <><Spinner size="sm" /> Submitting...</> : "Submit Ticket"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateTicketPage;
