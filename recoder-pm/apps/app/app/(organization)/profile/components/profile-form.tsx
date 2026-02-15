"use client";

import { Input } from "@repo/design-system/components/precomposed/input";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateProfile as updateProfileAction } from "@/actions/profile/update";

type ProfileFormProps = {
  defaultFirstName: string;
  defaultLastName: string;
  defaultEmail: string;
};

export const ProfileForm = ({
  defaultFirstName,
  defaultLastName,
  defaultEmail,
}: ProfileFormProps) => {
  const router = useRouter();
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const disabled =
    loading ||
    (firstName === defaultFirstName &&
      lastName === defaultLastName &&
      email === defaultEmail);

  const handleSubmit = async () => {
    try {
      if (disabled) {
        return;
      }

      setLoading(true);

      const response = await updateProfileAction({
        firstName,
        lastName,
        ...(email !== defaultEmail ? { email } : {}),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      router.refresh();
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Input
        label="First Name"
        name="first-name"
        onChange={(e) => setFirstName(e.target.value)}
        placeholder="First Name"
        value={firstName}
      />
      <Input
        label="Last Name"
        name="last-name"
        onChange={(e) => setLastName(e.target.value)}
        placeholder="Last Name"
        value={lastName}
      />
      <Input
        label="Email"
        name="email"
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        value={email}
      />
      <Button disabled={disabled} type="submit">
        Update
      </Button>
    </form>
  );
};
