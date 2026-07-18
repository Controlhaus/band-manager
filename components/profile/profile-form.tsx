"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { updateProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { EQUIPMENT_CATEGORIES, type EquipmentItem } from "@/lib/types";
import type { SkillLevel } from "@prisma/client";

const SKILLS: SkillLevel[] = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "PROFESSIONAL",
];

export function ProfileForm({
  name: initialName,
  instruments: initialInstruments,
  skillLevel: initialSkill,
  equipment: initialEquipment,
  bio: initialBio,
  instrumentSuggestions,
}: {
  name: string;
  instruments: string[];
  skillLevel: SkillLevel | null;
  equipment: EquipmentItem[];
  bio: string;
  instrumentSuggestions: string[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [name, setName] = React.useState(initialName);
  const [instruments, setInstruments] = React.useState<string[]>(initialInstruments);
  const [instrumentInput, setInstrumentInput] = React.useState("");
  const [skill, setSkill] = React.useState<SkillLevel | "none">(
    initialSkill ?? "none",
  );
  const [equipment, setEquipment] = React.useState<EquipmentItem[]>(initialEquipment);
  const [bio, setBio] = React.useState(initialBio);

  function addInstrument(value: string) {
    const v = value.trim();
    if (!v || instruments.includes(v)) return;
    setInstruments((prev) => [...prev, v]);
    setInstrumentInput("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await updateProfile({
      name,
      instruments,
      skillLevel: skill === "none" ? null : skill,
      equipment: equipment.filter((eq) => eq.name.trim()),
      bio,
    });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    toast({ title: "Profile saved" });
    router.refresh();
  }

  const listId = "instrument-suggestions";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label>Skill level</Label>
          <Select value={skill} onValueChange={(v) => setSkill(v as SkillLevel | "none")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {SKILLS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="instrument-input">Instruments</Label>
        <div className="flex flex-wrap gap-1">
          {instruments.map((i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {i}
              <button
                type="button"
                onClick={() =>
                  setInstruments((prev) => prev.filter((x) => x !== i))
                }
                aria-label={`Remove ${i}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            id="instrument-input"
            list={listId}
            value={instrumentInput}
            onChange={(e) => setInstrumentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addInstrument(instrumentInput);
              }
            }}
            placeholder="Add an instrument and press Enter"
          />
          <datalist id={listId}>
            {instrumentSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Button type="button" variant="outline" onClick={() => addInstrument(instrumentInput)}>
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Equipment</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setEquipment((prev) => [...prev, { name: "", category: "Instrument", notes: "" }])
            }
          >
            <Plus /> Add row
          </Button>
        </div>
        {equipment.length === 0 && (
          <p className="text-sm text-muted-foreground">No equipment added.</p>
        )}
        {equipment.map((eq, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_1fr_auto]">
            <Input
              placeholder="Name"
              value={eq.name}
              onChange={(e) =>
                setEquipment((prev) =>
                  prev.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)),
                )
              }
            />
            <Select
              value={eq.category}
              onValueChange={(v) =>
                setEquipment((prev) =>
                  prev.map((x, xi) =>
                    xi === i ? { ...x, category: v as EquipmentItem["category"] } : x,
                  ),
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Notes"
              value={eq.notes ?? ""}
              onChange={(e) =>
                setEquipment((prev) =>
                  prev.map((x, xi) => (xi === i ? { ...x, notes: e.target.value } : x)),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEquipment((prev) => prev.filter((_, xi) => xi !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
