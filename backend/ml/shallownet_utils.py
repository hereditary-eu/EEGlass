"""From https://github.com/MedMaxLab/shallownetXAI/blob/27d8a94b770d286a20c2c7bc2229be2e48f2a3c6/AllFnc/training.py"""

import sys
from collections.abc import Callable, Iterable

import torch
import torch.nn.functional as F
import tqdm
from selfeeg.ssl import evaluate_loss
from torch import nn


def lossBinary(yhat, ytrue):
    """
    Just an alias to the binary_cross_entropy_with_logits function.
    Remember that yhat must be a tensor with the model output in the logit form,
    so no sigmoid operator should be applied on the model's output.
    Remember that ytrue must be a float tensor with the same size as yhat and
    with 0 or 1 based on the binary class.
    """
    yhat = yhat.flatten()
    return F.binary_cross_entropy_with_logits(yhat, ytrue)


def lossMulti(yhat, ytrue):
    """
    Just an alias to the binary_cross_entropy_with_logits function.
    Remember that yhat must be a tensor with the model output in the logit form,
    so no sigmoid operator should be applied on the model's output.
    Remember that ytrue must be a float tensor with the same size as yhat and
    with 0 or 1 based on the true class (e.g., [[0.,1.,0.], [1.,0.,0.], [0.,0.,1.]])
    Alternatively, it must be a long tensor with the class index (e.g., [1,0,2])
    """
    return F.cross_entropy(yhat, ytrue)


def train_model(
    model: nn.Module,
    train_dataloader: torch.utils.data.DataLoader,
    epochs=1,
    optimizer=None,
    augmenter=None,
    loss_func: Callable | list[Callable] | None = None,
    loss_args: list | dict | None = None,
    validation_loss_func: Callable | list[Callable] | None = None,
    validation_loss_args: list | dict | None = None,
    label_encoder: Callable | list[Callable] | None = None,
    lr_scheduler=None,
    EarlyStopper=None,
    validation_dataloader: torch.utils.data.DataLoader | None = None,
    verbose=True,
    device: str | torch.device | None = None,
    return_loss_info: bool = False,
) -> dict | None:
    """
    copy of selfeeg.ssl.fine_tune function with the possibility to give
    a different validation loss function (and args)
    """

    if validation_loss_args is None:
        validation_loss_args = []
    if loss_args is None:
        loss_args = []
    if device is None:
        device = torch.device("cpu")
    else:
        if isinstance(device, str):
            device = torch.device(device.lower())
        elif isinstance(device, torch.device):
            pass
        else:
            raise ValueError("device must be a string or a torch.device instance")
    model.to(device=device)

    if not (isinstance(train_dataloader, torch.utils.data.DataLoader)):
        raise ValueError("Current implementation accept only training data as a pytorch DataLoader")
    if not (isinstance(epochs, int)):
        epochs = int(epochs)
    if epochs < 1:
        raise ValueError("epochs must be bigger than 1")
    if optimizer is None:
        optimizer = torch.optim.Adam(model.parameters())
    if loss_func is None:
        raise ValueError("loss function not given")
    if not (isinstance(loss_args, (list, dict))):
        raise ValueError("loss_args must be a list or a dict with all optional arguments of the loss function")

    perform_validation = False
    if validation_dataloader is not None:
        if not (isinstance(validation_dataloader, torch.utils.data.DataLoader)):
            raise ValueError("Current implementation accept only validation data as a pytorch DataLoader")
        else:
            perform_validation = True
            if validation_loss_func is None:
                validation_loss_func = loss_func
                validation_loss_args = loss_args

    if EarlyStopper is not None and EarlyStopper.monitored == "validation" and not (perform_validation):
        print(
            "Early stopper monitoring is set to validation loss"
            ", but no validation data are given. "
            "Internally changing monitoring to training loss"
        )
        EarlyStopper.monitored = "train"

    loss_info = {i: [None, None] for i in range(epochs)}
    N_train = len(train_dataloader)
    N_val = 0 if validation_dataloader is None else len(validation_dataloader)
    for epoch in range(epochs):
        print(f"epoch [{epoch + 1:6>}/{epochs:6>}]") if verbose else None

        train_loss = 0
        val_loss = 0
        train_loss_tot = 0
        val_loss_tot = 0
        if not (model.training):
            model.train()
        with tqdm.tqdm(
            total=N_train + N_val,
            ncols=100,
            bar_format="{desc}{percentage:3.0f}%|{bar:15}| {n_fmt}/{total_fmt} [{rate_fmt}{postfix}]",
            disable=not (verbose),
            unit=" Batch",
            file=sys.stdout,
        ) as pbar:
            all_Yhat = []  # Will store predictions (Yhat) for each batch
            all_Ytrue = []  # Will store true labels (Ytrue) for each batch

            for batch_idx, (X, Ytrue) in enumerate(train_dataloader):
                optimizer.zero_grad()

                # possible cases: X is tensor or not, Augmenter is iterable or not
                if isinstance(X, torch.Tensor):
                    X = X.to(device=device)
                    if augmenter is not None:
                        X = augmenter(X)
                else:
                    if augmenter is not None:
                        if isinstance(augmenter, Iterable):
                            Nmin = min(len(augmenter), len(X))
                            for i in range(Nmin):
                                X[i] = X[i].to(device=device)
                                X[i] = augmenter[i](X[i])
                            for i in range(Nmin, len(X)):
                                X[i] = X[i].to(device=device)
                        else:
                            for i in range(len(X)):
                                X[i] = X[i].to(device=device)
                                X[i] = augmenter(X[i])
                    else:
                        for i in range(len(X)):
                            X[i] = X[i].to(device=device)

                if isinstance(Ytrue, torch.Tensor):
                    if label_encoder is not None:
                        Ytrue = label_encoder(Ytrue)
                    Ytrue = Ytrue.to(device=device)
                else:
                    if label_encoder is not None:
                        if isinstance(label_encoder, Iterable):
                            Nmin = min(len(label_encoder), len(Ytrue))
                            for i in range(Nmin):
                                Ytrue[i] = label_encoder[i](Ytrue[i])
                                Ytrue[i] = Ytrue[i].to(device=device)
                            for i in range(len(Ytrue)):
                                Ytrue[i] = Ytrue[i].to(device=device)
                        else:
                            for i in range(len(Ytrue)):
                                Ytrue[i] = label_encoder(Ytrue[i])
                                Ytrue[i] = Ytrue[i].to(device=device)
                    else:
                        for i in range(len(Ytrue)):
                            Ytrue[i] = Ytrue[i].to(device=device)

                Yhat = model(X)
                train_loss = evaluate_loss(loss_func, [Yhat, Ytrue], loss_args)

                all_Yhat.append(Yhat.detach().cpu())  # Detach and move to CPU (to avoid memory issues)
                all_Ytrue.append(Ytrue.detach().cpu())  # Detach and move to CPU

                train_loss.backward()
                optimizer.step()
                train_loss_tot += train_loss.item()
                # verbose print
                if verbose:
                    pbar.set_description(f" train {batch_idx + 1:8<}/{len(train_dataloader):8>}")
                    pbar.set_postfix_str(
                        f"train_loss={train_loss_tot / (batch_idx + 1):.5f}, val_loss={val_loss_tot:.5f}"
                    )
                    pbar.update()
            train_loss_tot /= batch_idx + 1

            # # At the end of the epoch, after accumulating all predictions and true labels:
            # all_Yhat = torch.cat(all_Yhat, dim=0)  # (total_samples, num_classes)
            # all_Ytrue = torch.cat(all_Ytrue, dim=0)  # (total_samples,)

            # # Get class predictions from Yhat (choose the class with the highest score)
            # Yhat_classes = torch.argmax(all_Yhat, dim=1)  # (total_samples,)

            # # Compute balanced accuracy
            # y_true_np = all_Ytrue.cpu().numpy()  # Move to CPU and convert to numpy
            # y_pred_np = Yhat_classes.cpu().numpy()  # Move to CPU and convert to numpy

            # # Compute balanced accuracy score
            # epoch_balanced_accuracy = balanced_accuracy_score(y_true_np, y_pred_np)

            # # Print final result for balanced accuracy at the end of the epoch
            # print(f"Epoch {epoch}: Balanced Accuracy = {epoch_balanced_accuracy*100:.2f}%")

            if lr_scheduler != None:
                # lr_scheduler.step(val_loss) #CHANGED HERE
                lr_scheduler.step()

            # Perform validation if validation dataloader were given
            if perform_validation:
                model.eval()
                with torch.no_grad():
                    val_loss = 0
                    for batch_idx, (X, Ytrue) in enumerate(validation_dataloader):
                        if isinstance(X, torch.Tensor):
                            X = X.to(device=device)
                        else:
                            for i in range(len(X)):
                                X[i] = X[i].to(device=device)

                        if isinstance(Ytrue, torch.Tensor):
                            if label_encoder is not None:
                                Ytrue = label_encoder(Ytrue)
                            Ytrue = Ytrue.to(device=device)
                        else:
                            if label_encoder is not None:
                                if isinstance(label_encoder, Iterable):
                                    Nmin = min(len(label_encoder), len(Ytrue))
                                    for i in range(Nmin):
                                        Ytrue[i] = label_encoder[i](Ytrue[i])
                                        Ytrue[i] = Ytrue[i].to(device=device)
                                    for i in range(len(Ytrue)):
                                        Ytrue[i] = Ytrue[i].to(device=device)
                                else:
                                    for i in range(len(Ytrue)):
                                        Ytrue[i] = label_encoder(Ytrue[i])
                                        Ytrue[i] = Ytrue[i].to(device=device)
                            else:
                                for i in range(len(Ytrue)):
                                    Ytrue[i] = Ytrue[i].to(device=device)

                        Yhat = model(X)
                        val_loss = evaluate_loss(validation_loss_func, [Yhat, Ytrue], validation_loss_args)
                        val_loss_tot += val_loss.item()
                        if verbose:
                            pbar.set_description(f"   val {batch_idx + 1:8<}/{len(validation_dataloader):8>}")
                            pbar.set_postfix_str(
                                f"train_loss={train_loss_tot:.5f}, val_loss={val_loss_tot / (batch_idx + 1):.5f}"
                            )
                            pbar.update()

                    val_loss_tot /= batch_idx + 1

        # Deal with earlystopper if given
        if EarlyStopper != None:
            updated_mdl = False
            if EarlyStopper.monitored == "validation":
                curr_monitored = val_loss_tot
            else:
                curr_monitored = train_loss_tot
            EarlyStopper.early_stop(curr_monitored)
            if EarlyStopper.record_best_weights and EarlyStopper.best_loss == curr_monitored:
                EarlyStopper.rec_best_weights(model)
                updated_mdl = True
            if EarlyStopper():
                print(f"no improvement after {EarlyStopper.patience} epochs. Training stopped")
                if EarlyStopper.record_best_weights and not (updated_mdl):
                    EarlyStopper.restore_best_weights(model)
                if return_loss_info:
                    return loss_info
                else:
                    return

        if return_loss_info:
            loss_info[epoch] = [train_loss_tot, val_loss_tot]  # , epoch_balanced_accuracy]
    if return_loss_info:
        return loss_info
