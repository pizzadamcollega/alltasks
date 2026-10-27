"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deleteAccountAction,
  resetPasswordAction,
  setActiveAction,
  updateAccountAction,
} from "@/features/accounts/actions";

export function AccountSection({
  userId,
  branchSlug,
  active,
  fullName,
  username,
  startedOn,
  canDelete = true,
}: {
  userId: string;
  branchSlug: string;
  active: boolean;
  fullName: string;
  username: string;
  startedOn: string | null;
  /** False on your own profile — the server refuses it too. */
  canDelete?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  function handleEdit(formData: FormData) {
    startTransition(async () => {
      const result = await updateAccountAction(userId, branchSlug, {
        fullName: formData.get("fullName"),
        username: formData.get("username"),
        startedOn: formData.get("startedOn"),
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success("Bilgiler güncellendi");
        setEditOpen(false);
      }
    });
  }

  function handleReset(formData: FormData) {
    startTransition(async () => {
      const result = await resetPasswordAction(userId, branchSlug, formData.get("newPassword"));
      if (result.error) toast.error(result.error);
      else {
        toast.success("Şifre sıfırlandı");
        setResetOpen(false);
      }
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const result = await setActiveAction(userId, branchSlug, !active);
      if (result.error) toast.error(result.error);
      else toast.success(active ? "Hesap pasife alındı" : "Hesap aktifleştirildi");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      // On success the action redirects to the list, so only errors come back.
      const result = await deleteAccountAction(userId, branchSlug, confirmText.trim());
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Card className="rounded-card">
      <CardHeader>
        <CardTitle className="text-base">Hesap</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              Bilgileri düzenle
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bilgileri düzenle</DialogTitle>
            </DialogHeader>
            <form action={handleEdit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fullName">Ad soyad</Label>
                <Input id="fullName" name="fullName" defaultValue={fullName} minLength={2} maxLength={80} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">Kullanıcı adı</Label>
                <Input
                  id="username"
                  name="username"
                  defaultValue={username}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
                <span className="text-xs text-pz-muted">Değişirse bir sonraki girişte yeni ad kullanılır.</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="startedOn">Başlangıç tarihi</Label>
                <Input id="startedOn" name="startedOn" type="date" defaultValue={startedOn ?? ""} />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              Şifreyi sıfırla
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni şifre</DialogTitle>
            </DialogHeader>
            <form action={handleReset} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newPassword">Yeni şifre</Label>
                <Input id="newPassword" name="newPassword" type="text" minLength={8} required />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Kaydediliyor…" : "Şifreyi sıfırla"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={handleToggleActive}
          className={
            active
              ? "border-pz-bad text-pz-bad hover:bg-pz-bad-soft"
              : "border-pz-ok text-pz-ok hover:bg-pz-ok-soft"
          }
        >
          {active ? "Hesabı pasife al" : "Hesabı aktifleştir"}
        </Button>

        {canDelete && (
          <Dialog
            open={deleteOpen}
            onOpenChange={(open) => {
              setDeleteOpen(open);
              if (!open) setConfirmText("");
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" variant="outline" className="border-pz-bad text-pz-bad hover:bg-pz-bad-soft">
                Hesabı sil
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Hesabı kalıcı olarak sil</DialogTitle>
                <DialogDescription>
                  Bu işlem geri alınamaz. {fullName} kişisinin tüm mesai kayıtları, ödemeleri, ücret geçmişi
                  ve programı silinir.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmUsername">
                  Onaylamak için <span className="font-bold">{username}</span> yaz
                </Label>
                <Input
                  id="confirmUsername"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || confirmText.trim() !== username}
                onClick={handleDelete}
              >
                {pending ? "Siliniyor…" : "Kalıcı olarak sil"}
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
